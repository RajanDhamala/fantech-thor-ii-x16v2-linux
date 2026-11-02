package main

import (
	"bufio"
	"context"
	"crypto/rand"
	"crypto/sha256"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"
)

//go:embed scripts/vm_network.py
var networkBridge string

type networkCapture struct {
	Name     string  `json:"name,omitempty"`
	Notes    string  `json:"notes,omitempty"`
	Source   string  `json:"source,omitempty"`
	Filename string  `json:"filename"`
	VM       string  `json:"vm,omitempty"`
	Adapter  int     `json:"adapter,omitempty"`
	Started  float64 `json:"started,omitempty"`
	Deadline float64 `json:"deadline,omitempty"`
	Ended    float64 `json:"ended,omitempty"`
	Status   string  `json:"status,omitempty"`
	Reason   string  `json:"reason,omitempty"`
	Bytes    int64   `json:"bytes"`
}

type networkStatus struct {
	USBTarget string           `json:"usb_target"`
	VM        string           `json:"vm"`
	Adapter   int              `json:"adapter"`
	Decoder   bool             `json:"decoder"`
	Active    *networkCapture  `json:"active"`
	Captures  []networkCapture `json:"captures"`
}

type networkService struct {
	vm, dir string
	adapter int
	mu      sync.Mutex
	workers map[string]context.CancelFunc
	wg      sync.WaitGroup
	closed  bool
}

func newNetworkService(vm, root string, adapter int) (*networkService, error) {
	if adapter < 1 || adapter > 8 {
		return nil, fmt.Errorf("VM_NETWORK_ADAPTER must be between 1 and 8")
	}
	id := sha256.Sum256([]byte(vm))
	dir, err := filepath.Abs(filepath.Join(root, fmt.Sprintf("vm-%x", id[:6])))
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(dir, 0700); err != nil {
		return nil, err
	}
	return &networkService{vm: vm, dir: dir, adapter: adapter, workers: make(map[string]context.CancelFunc)}, nil
}

func validCaptureName(name string) bool {
	return filepath.Base(name) == name && !strings.ContainsAny(name, `/\`) && strings.HasPrefix(name, "trace-") && (strings.HasSuffix(name, ".pcap") || strings.HasSuffix(name, ".pcapng"))
}

func (n *networkService) capturePath(name string) (string, error) {
	if !validCaptureName(name) {
		return "", os.ErrNotExist
	}
	path := filepath.Join(n.dir, name)
	info, err := os.Lstat(path)
	if err != nil {
		return "", err
	}
	if !info.Mode().IsRegular() {
		return "", os.ErrNotExist
	}
	return path, nil
}

func (n *networkService) active() (*networkCapture, error) {
	path := filepath.Join(n.dir, ".active.json")
	file, err := os.Open(path)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	defer file.Close()
	var capture networkCapture
	if err := json.NewDecoder(io.LimitReader(file, 64<<10)).Decode(&capture); err != nil {
		return nil, err
	}
	if capture.VM != n.vm || capture.Adapter != n.adapter || !validCaptureName(capture.Filename) {
		return nil, fmt.Errorf("saved capture state does not match this VM and adapter")
	}
	return &capture, nil
}

func (n *networkService) Status() (networkStatus, error) {
	status := networkStatus{VM: n.vm, Adapter: n.adapter, USBTarget: env("VM_USB_VENDOR", "30fa") + ":" + env("VM_USB_PRODUCT", "1440"), Captures: []networkCapture{}}
	_, err := exec.LookPath("sharkd")
	status.Decoder = err == nil
	status.Active, err = n.active()
	if err != nil {
		return status, err
	}
	entries, err := os.ReadDir(n.dir)
	if err != nil {
		return status, err
	}
	for _, entry := range entries {
		if !validCaptureName(entry.Name()) || !entry.Type().IsRegular() {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		capture := networkCapture{Filename: entry.Name(), Bytes: info.Size(), Started: float64(info.ModTime().Unix()), Status: "saved"}
		if file, err := os.Open(filepath.Join(n.dir, entry.Name()+".json")); err == nil {
			json.NewDecoder(io.LimitReader(file, 64<<10)).Decode(&capture)
			file.Close()
		}
		capture.Filename, capture.Bytes = entry.Name(), info.Size()
		if status.Active != nil && status.Active.Filename == entry.Name() {
			status.Active.Bytes = info.Size()
			continue
		}
		status.Captures = append(status.Captures, capture)
	}
	sort.Slice(status.Captures, func(i, j int) bool { return status.Captures[i].Started > status.Captures[j].Started })
	return status, nil
}

type recordingDetails struct {
	Name  string `json:"name"`
	Notes string `json:"notes,omitempty"`
}

func (details recordingDetails) normalized() (recordingDetails, error) {
	details.Name, details.Notes = strings.TrimSpace(details.Name), strings.TrimSpace(details.Notes)
	if !utf8.ValidString(details.Name) || utf8.RuneCountInString(details.Name) > 120 || strings.ContainsFunc(details.Name, unicode.IsControl) {
		return details, fmt.Errorf("recording name must be at most 120 characters on one line")
	}
	if !utf8.ValidString(details.Notes) || utf8.RuneCountInString(details.Notes) > 2000 || strings.ContainsFunc(details.Notes, func(r rune) bool { return unicode.IsControl(r) && r != '\n' && r != '\t' }) {
		return details, fmt.Errorf("recording notes must be at most 2000 characters")
	}
	if details.Name == "" {
		details.Name = "Recording " + time.Now().Format("2006-01-02 15:04:05")
	}
	return details, nil
}

func recordingSlug(name string) string {
	var slug strings.Builder
	for _, r := range strings.ToLower(name) {
		if slug.Len() >= 48 {
			break
		}
		if r >= 'a' && r <= 'z' || r >= '0' && r <= '9' {
			slug.WriteRune(r)
		} else if slug.Len() > 0 && !strings.HasSuffix(slug.String(), "-") {
			slug.WriteByte('-')
		}
	}
	if value := strings.Trim(slug.String(), "-"); value != "" {
		return value
	}
	return "recording"
}

func (n *networkService) command(ctx context.Context, mode, name string, seconds int, source string, details ...recordingDetails) *exec.Cmd {
	cmd := exec.CommandContext(ctx, env("VBOX_PYTHON", "/usr/bin/python3"), "-c", networkBridge,
		mode, n.vm, strconv.Itoa(n.adapter), n.dir, name, strconv.Itoa(seconds), strconv.Itoa(os.Getpid()), source)
	if len(details) > 0 {
		encoded, _ := json.Marshal(details[0])
		cmd.Env = append(os.Environ(), "SCREENDROP_RECORDING="+string(encoded))
	}
	cmd.Cancel = func() error { return cmd.Process.Signal(os.Interrupt) }
	cmd.WaitDelay = 5 * time.Second
	return cmd
}

func (n *networkService) Start(ctx context.Context, seconds int) (networkStatus, error) {
	return n.StartCapture(ctx, seconds, "network")
}

func (n *networkService) StartCapture(ctx context.Context, seconds int, source string, metadata ...recordingDetails) (networkStatus, error) {
	details := recordingDetails{}
	if len(metadata) > 0 {
		details = metadata[0]
	}
	details, err := details.normalized()
	if err != nil {
		return networkStatus{}, err
	}
	if source != "network" && source != "usb" {
		return networkStatus{}, fmt.Errorf("source must be usb or network")
	}
	if seconds == 0 {
		seconds = 30
	}
	if seconds < 1 || seconds > 120 {
		return networkStatus{}, fmt.Errorf("duration_seconds must be between 1 and 120")
	}
	n.mu.Lock()
	defer n.mu.Unlock()
	if n.closed {
		return networkStatus{}, fmt.Errorf("network service is closing")
	}
	if active, err := n.active(); err != nil || active != nil {
		if err != nil {
			return networkStatus{}, err
		}
		return networkStatus{}, fmt.Errorf("a VM capture is already active; stop or recover it first")
	}
	workerCtx, cancel := context.WithCancel(context.Background())
	name := fmt.Sprintf("trace-%s-%d-%s.pcap", recordingSlug(details.Name), time.Now().Unix(), rand.Text()[:8])
	if source == "usb" {
		name += "ng"
	}
	cmd := n.command(workerCtx, "capture", name, seconds, source, details)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		cancel()
		return networkStatus{}, err
	}
	diagnostics := &boundedOutput{max: 8192}
	cmd.Stderr = diagnostics
	if err := cmd.Start(); err != nil {
		cancel()
		return networkStatus{}, err
	}
	startup := make(chan error, 1)
	go func() {
		var response struct {
			Status string `json:"status"`
			Error  string `json:"error"`
		}
		if err := json.NewDecoder(io.LimitReader(stdout, 8192)).Decode(&response); err != nil {
			startup <- fmt.Errorf("capture worker could not start: %w", err)
			return
		}
		if response.Status != "started" {
			startup <- fmt.Errorf("capture failed: %s", response.Error)
			return
		}
		startup <- nil
	}()
	select {
	case err := <-startup:
		if err != nil {
			cancel()
			waitErr := cmd.Wait()
			message := err.Error()
			if waitErr != nil {
				message += "\nWorker exit: " + waitErr.Error()
			}
			if detail := strings.TrimSpace(diagnostics.String()); detail != "" {
				message += "\n" + detail
			}
			return networkStatus{}, fmt.Errorf("%s", message)
		}
	case <-ctx.Done():
		cancel()
		cmd.Wait()
		return networkStatus{}, ctx.Err()
	}
	n.workers[name] = cancel
	n.wg.Add(1)
	go func() {
		defer n.wg.Done()
		err := cmd.Wait()
		cancel()
		n.mu.Lock()
		delete(n.workers, name)
		n.mu.Unlock()
		if err != nil {
			log.Printf("VM network capture worker ended: %v; use Stop to recover any pending trace", err)
		}
	}()
	return n.Status()
}

func (n *networkService) Stop(ctx context.Context) (networkStatus, error) {
	active, err := n.active()
	if err != nil {
		return networkStatus{}, err
	}
	if active == nil {
		return n.Status()
	}
	marker := filepath.Join(n.dir, active.Filename+".stop")
	file, err := os.OpenFile(marker, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err == nil {
		file.Close()
	} else if !os.IsExist(err) {
		return networkStatus{}, err
	}
	// A running worker polls the marker; if it exited, recover under its file lock.
	deadline := time.NewTimer(2 * time.Second)
	defer deadline.Stop()
	tick := time.NewTicker(100 * time.Millisecond)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return networkStatus{}, ctx.Err()
		case <-tick.C:
			current, err := n.active()
			if err != nil {
				return networkStatus{}, err
			}
			if current == nil || current.Filename != active.Filename {
				return n.Status()
			}
		case <-deadline.C:
			cmd := n.command(ctx, "recover", active.Filename, 0, envQuery(active.Source, "network"))
			var output boundedOutput
			output.max = 16384
			cmd.Stdout, cmd.Stderr = &output, &output
			if err := cmd.Run(); err != nil {
				return networkStatus{}, fmt.Errorf("couldn’t stop or recover VM capture: %s", output.String())
			}
			os.Remove(marker)
			return n.Status()
		}
	}
}

func (n *networkService) Close() {
	n.mu.Lock()
	n.closed = true
	for _, cancel := range n.workers {
		cancel()
	}
	n.mu.Unlock()
	n.wg.Wait()
}

// Keep subprocess diagnostics and decoder responses bounded in memory.
type boundedOutput struct {
	data []byte
	max  int
	mu   sync.Mutex
}

func (b *boundedOutput) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if left := b.max - len(b.data); left > 0 {
		if left > len(p) {
			left = len(p)
		}
		b.data = append(b.data, p[:left]...)
	}
	return len(p), nil
}
func (b *boundedOutput) String() string { b.mu.Lock(); defer b.mu.Unlock(); return string(b.data) }

type packetRow struct {
	Number  int      `json:"num"`
	Columns []string `json:"c"`
}
type packetReport struct {
	Live      bool        `json:"live"`
	Cursor    int         `json:"cursor"`
	Filename  string      `json:"filename"`
	Filter    string      `json:"filter"`
	Total     int         `json:"total_packets"`
	Protocols []string    `json:"protocols"`
	First     float64     `json:"first"`
	Last      float64     `json:"last"`
	Offset    int         `json:"offset"`
	More      bool        `json:"more"`
	Columns   []string    `json:"columns"`
	Packets   []packetRow `json:"packets"`
}

func (n *networkService) Packets(ctx context.Context, name, filter string, offset, limit int) (packetReport, error) {
	return n.packetsSince(ctx, name, filter, offset, limit, 0)
}

func (n *networkService) packetsSince(ctx context.Context, name, filter string, offset, limit, since int) (packetReport, error) {
	report := packetReport{Filename: name, Filter: filter, Offset: offset, Columns: []string{"No.", "Time", "Source", "Destination", "Protocol", "Length", "Info"}}
	if len(filter) > 1024 || offset < 0 || offset > 1000000 || limit < 1 || limit > 200 || since < 0 {
		return report, fmt.Errorf("filter must be at most 1024 characters; offset 0–1000000; limit 1–200")
	}
	active, err := n.active()
	if err != nil {
		return report, err
	}
	if active != nil && active.Filename == name {
		report.Live = true
	}
	path, err := n.capturePath(name)
	if err != nil {
		if report.Live && os.IsNotExist(err) {
			return report, nil
		}
		return report, err
	}
	info, err := os.Stat(path)
	if err != nil {
		return report, err
	}
	if info.Size() > 64<<20 {
		return report, fmt.Errorf("capture exceeds the 64 MB analysis limit")
	}
	if report.Live {
		snapshot, err := captureSnapshot(path)
		if errors.Is(err, errCapturePending) {
			return report, nil
		}
		if err != nil {
			return report, err
		}
		defer os.Remove(snapshot)
		path = snapshot
	}
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "sharkd", "-")
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return report, err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return report, err
	}
	cmd.Stderr = &boundedOutput{max: 8192}
	if err := cmd.Start(); err != nil {
		return report, fmt.Errorf("start Wireshark decoder (sharkd): %w", err)
	}
	defer func() { stdin.Close(); cmd.Process.Kill(); cmd.Wait() }()
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 4096), 4<<20)
	id := 0
	call := func(method string, params any, result any) error {
		id++
		if err := json.NewEncoder(stdin).Encode(map[string]any{"jsonrpc": "2.0", "id": id, "method": method, "params": params}); err != nil {
			return err
		}
		if !scanner.Scan() {
			if err := scanner.Err(); err != nil {
				return err
			}
			return fmt.Errorf("Wireshark decoder ended before responding")
		}
		var response struct {
			ID     int             `json:"id"`
			Result json.RawMessage `json:"result"`
			Error  *struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		if err := json.Unmarshal(scanner.Bytes(), &response); err != nil {
			return err
		}
		if response.Error != nil {
			return fmt.Errorf("Wireshark: %s", response.Error.Message)
		}
		if response.ID != id {
			return fmt.Errorf("unexpected Wireshark response")
		}
		return json.Unmarshal(response.Result, result)
	}
	var formats struct {
		Columns []struct {
			Format string `json:"format"`
		} `json:"columns"`
	}
	if err := call("info", map[string]any{}, &formats); err != nil {
		return report, err
	}
	var ignored any
	if err := call("load", map[string]string{"file": path}, &ignored); err != nil {
		return report, err
	}
	if filter != "" {
		if err := call("check", map[string]string{"filter": filter}, &ignored); err != nil {
			return report, err
		}
	}
	var summary struct {
		Frames    int      `json:"frames"`
		Protocols []string `json:"protocols"`
		First     float64  `json:"first"`
		Last      float64  `json:"last"`
	}
	if err := call("analyse", map[string]any{}, &summary); err != nil {
		return report, err
	}
	report.Total, report.Protocols, report.First, report.Last = summary.Frames, summary.Protocols, summary.First, summary.Last
	report.Cursor = summary.Frames
	queryFilter := filter
	if since > 0 {
		queryFilter = fmt.Sprintf("frame.number > %d", since)
		if filter != "" {
			queryFilter = "(" + filter + ") && " + queryFilter
		}
	}
	params := map[string]any{"filter": queryFilter, "limit": limit + 1}
	if offset > 0 {
		params["skip"] = offset
	}
	for column, format := range []string{"%m", "%Rt", "%us", "%ud", "%p", "%L", "%i"} {
		found := false
		for index, entry := range formats.Columns {
			if entry.Format == format {
				params[fmt.Sprintf("column%d", column)] = index
				found = true
				break
			}
		}
		if !found {
			return report, fmt.Errorf("Wireshark decoder is missing column format %s", format)
		}
	}
	if err := call("frames", params, &report.Packets); err != nil {
		return report, err
	}
	if len(report.Packets) > limit {
		report.More = true
		report.Packets = report.Packets[:limit]
		report.Cursor = report.Packets[len(report.Packets)-1].Number
	}
	return report, nil
}
