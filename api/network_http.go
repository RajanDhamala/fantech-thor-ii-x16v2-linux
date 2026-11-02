package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func networkJSON(w http.ResponseWriter, value any, err error) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	if err != nil {
		status := http.StatusBadRequest
		if os.IsNotExist(err) {
			status = http.StatusNotFound
		}
		w.WriteHeader(status)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}
	json.NewEncoder(w).Encode(value)
}

func (n *networkService) registerHTTP(mux *http.ServeMux) {
	mux.HandleFunc("GET /network", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		render(w, "network-page", struct {
			VM      string
			Adapter int
		}{n.vm, n.adapter})
	})
	mux.HandleFunc("GET /api/network", func(w http.ResponseWriter, r *http.Request) { status, err := n.Status(); networkJSON(w, status, err) })
	for _, action := range []string{"start", "stop"} {
		mux.HandleFunc("POST /api/network/"+action, func(w http.ResponseWriter, r *http.Request) {
			if status, message := checkOrigin(r); status != 0 {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(status)
				json.NewEncoder(w).Encode(map[string]string{"error": message})
				return
			}
			if r.Header.Get("X-VM-Network") != "true" {
				networkJSON(w, nil, fmt.Errorf("use the VM packet capture controls"))
				return
			}
			ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
			defer cancel()
			var status networkStatus
			var err error
			if action == "start" {
				var args struct {
					Name     string `json:"name"`
					Notes    string `json:"notes"`
					Duration int    `json:"duration_seconds"`
					Source   string `json:"source"`
				}
				decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 32<<10))
				decoder.DisallowUnknownFields()
				if decodeErr := decoder.Decode(&args); decodeErr != nil {
					networkJSON(w, nil, fmt.Errorf("send a JSON object with name, optional notes, source and duration_seconds between 1 and 120"))
					return
				}
				if decodeErr := decoder.Decode(new(any)); decodeErr != io.EOF {
					networkJSON(w, nil, fmt.Errorf("send only one request object"))
					return
				}
				status, err = n.StartCapture(ctx, args.Duration, envQuery(args.Source, "network"), recordingDetails{Name: args.Name, Notes: args.Notes})
			} else {
				status, err = n.Stop(ctx)
			}
			networkJSON(w, status, err)
		})
	}
	mux.HandleFunc("GET /api/network/packets", func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		offset, err := strconv.Atoi(envQuery(q.Get("offset"), "0"))
		if err != nil {
			networkJSON(w, nil, fmt.Errorf("invalid offset"))
			return
		}
		limit, err := strconv.Atoi(envQuery(q.Get("limit"), "100"))
		if err != nil {
			networkJSON(w, nil, fmt.Errorf("invalid limit"))
			return
		}
		since, err := strconv.Atoi(envQuery(q.Get("since"), "0"))
		if err != nil || since < 0 {
			networkJSON(w, nil, fmt.Errorf("invalid since frame number"))
			return
		}
		report, err := n.packetsSince(r.Context(), q.Get("file"), q.Get("filter"), offset, limit, since)
		networkJSON(w, report, err)
	})
	mux.HandleFunc("GET /network/captures/{name}", func(w http.ResponseWriter, r *http.Request) {
		name := r.PathValue("name")
		path, err := n.capturePath(name)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		active, err := n.active()
		if err != nil {
			http.Error(w, "Couldn’t read capture status", 500)
			return
		}
		if active != nil && active.Filename == name {
			http.Error(w, "Stop the capture before downloading", 409)
			return
		}
		w.Header().Set("Content-Type", "application/vnd.tcpdump.pcap")
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", name))
		w.Header().Set("Cache-Control", "no-store")
		http.ServeFile(w, r, path)
	})
}

func envQuery(value, fallback string) string {
	if value != "" {
		return value
	}
	return fallback
}

type networkCaptureInput struct {
	Name     string `json:"name,omitempty" jsonschema:"Experiment name up to 120 characters, e.g. 01 Startup unchanged Apply; saved alongside the capture in a local JSON file. Omitted names get a timestamp label."`
	Notes    string `json:"notes,omitempty" jsonschema:"Optional experiment notes up to 2000 characters: actions, settings before and after, and visible results"`
	Source   string `json:"source,omitempty" jsonschema:"usb for the configured physical mouse or network for the VM adapter; default network. USB recording briefly reconnects the selected mouse and restores its original attachment when stopped."`
	Action   string `json:"action" jsonschema:"start or stop the configured VM USB mouse or network capture"`
	Duration int    `json:"duration_seconds,omitempty" jsonschema:"For start: 1 to 120 seconds, default 30; automatically stops near 20 MB too"`
}

type networkPacketInput struct {
	Since    int    `json:"since,omitempty" jsonschema:"Only frames after this frame number; use the returned cursor for incremental live polling"`
	Filename string `json:"filename" jsonschema:"Live or saved capture filename returned by network_status; no filesystem paths"`
	Filter   string `json:"filter,omitempty" jsonschema:"Wireshark display filter, e.g. dns, tcp, tls, ip.addr == 10.0.2.15 or tcp.analysis.retransmission"`
	Offset   int    `json:"offset,omitempty" jsonschema:"Number of matching packets to skip, default zero"`
	Limit    int    `json:"limit,omitempty" jsonschema:"Packets per page, 1 to 200, default 100"`
}

func networkToolResult(value any, err error) *mcp.CallToolResult {
	if err != nil {
		return toolFailure(err)
	}
	encoded, err := json.Marshal(value)
	if err != nil {
		return toolFailure(err)
	}
	return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: string(encoded)}}}
}

func (n *networkService) registerMCP(server *mcp.Server) {
	mcp.AddTool(server, &mcp.Tool{Name: "network_status", Description: "List saved USB/network captures, configured USB target, decoder availability and active recording for the configured VM."}, func(ctx context.Context, _ *mcp.CallToolRequest, _ struct{}) (*mcp.CallToolResult, any, error) {
		value, err := n.Status()
		return networkToolResult(value, err), nil, nil
	})
	mcp.AddTool(server, &mcp.Tool{Name: "network_capture", Description: "Start or stop a bounded VirtualBox capture: source usb records only the configured physical mouse already passed through to this VM, briefly reconnecting it; network records only the configured VM adapter. Does not capture host interfaces or take devices from another VM. Stops at the requested duration or near 20 MB and restores prior attachment/trace settings. Stop also attempts recovery."}, func(ctx context.Context, _ *mcp.CallToolRequest, args networkCaptureInput) (*mcp.CallToolResult, any, error) {
		ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
		defer cancel()
		var value networkStatus
		var err error
		switch args.Action {
		case "start":
			value, err = n.StartCapture(ctx, args.Duration, envQuery(args.Source, "network"), recordingDetails{Name: args.Name, Notes: args.Notes})
		case "stop":
			value, err = n.Stop(ctx)
		default:
			err = fmt.Errorf("action must be start or stop")
		}
		return networkToolResult(value, err), nil, nil
	})
	mcp.AddTool(server, &mcp.Tool{Name: "network_packets", Description: "Read live or saved VM USB/network captures using Wireshark sharkd. Poll once per second with since set to the returned cursor for incremental updates. Active files are decoded from complete-record snapshots. No arbitrary sharkd methods or file paths are accepted."}, func(ctx context.Context, _ *mcp.CallToolRequest, args networkPacketInput) (*mcp.CallToolResult, any, error) {
		if args.Limit == 0 {
			args.Limit = 100
		}
		value, err := n.packetsSince(ctx, args.Filename, args.Filter, args.Offset, args.Limit, args.Since)
		return networkToolResult(value, err), nil, nil
	})
}
