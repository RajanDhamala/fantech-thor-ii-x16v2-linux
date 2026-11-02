package main

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func networkFixture(t *testing.T, dir string) string {
	t.Helper()
	frame, err := hex.DecodeString("ffffffffffff00112233445508004500002000000000401100000a00020f080808083039270f000c000074657374")
	if err != nil {
		t.Fatal(err)
	}
	var data bytes.Buffer
	for _, value := range []any{uint32(0xa1b2c3d4), uint16(2), uint16(4), int32(0), uint32(0), uint32(65535), uint32(1)} {
		if err := binary.Write(&data, binary.LittleEndian, value); err != nil {
			t.Fatal(err)
		}
	}
	for i := 0; i < 3; i++ {
		for _, value := range []uint32{1700000000 + uint32(i), 0, uint32(len(frame)), uint32(len(frame))} {
			if err := binary.Write(&data, binary.LittleEndian, value); err != nil {
				t.Fatal(err)
			}
		}
		data.Write(frame)
	}
	name := "trace-fixture.pcap"
	if err := os.WriteFile(filepath.Join(dir, name), data.Bytes(), 0600); err != nil {
		t.Fatal(err)
	}
	return name
}

func testNetwork(t *testing.T) *networkService {
	t.Helper()
	n, err := newNetworkService("Test VM", t.TempDir(), 1)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(n.Close)
	return n
}

func TestNetworkPacketsWithInstalledWireshark(t *testing.T) {
	if _, err := exec.LookPath("sharkd"); err != nil {
		t.Skip("Wireshark sharkd is not installed")
	}
	n := testNetwork(t)
	name := networkFixture(t, n.dir)
	report, err := n.Packets(context.Background(), name, "udp", 0, 1)
	if err != nil {
		t.Fatal(err)
	}
	if report.Total != 3 || len(report.Packets) != 1 || !report.More || report.Packets[0].Number != 1 || len(report.Packets[0].Columns) != 7 {
		t.Fatalf("bad summary/page: %+v", report)
	}
	if report.Packets[0].Columns[2] != "10.0.2.15" || report.Packets[0].Columns[3] != "8.8.8.8" || report.Packets[0].Columns[4] != "UDP" {
		t.Fatalf("bad decoded columns: %v", report.Packets[0].Columns)
	}
	report, err = n.Packets(context.Background(), name, "udp", 1, 1)
	if err != nil || report.Packets[0].Number != 2 {
		t.Fatalf("pagination: %+v %v", report, err)
	}
	report, err = n.Packets(context.Background(), name, "frame.number >= 2", 1, 1)
	if err != nil || len(report.Packets) != 1 || report.Packets[0].Number != 3 {
		t.Fatalf("pagination must skip matching packets: %+v %v", report, err)
	}
	report, err = n.Packets(context.Background(), name, "tcp", 0, 10)
	if err != nil || len(report.Packets) != 0 {
		t.Fatal("display filter did not filter packets", err)
	}
	if _, err = n.Packets(context.Background(), name, "not_a_real_filter &&", 0, 10); err == nil {
		t.Fatal("invalid filter accepted")
	}
}

func TestNetworkRoutesAndCaptureScope(t *testing.T) {
	n := testNetwork(t)
	name := networkFixture(t, n.dir)
	app := newApp("Test VM", nil, t.TempDir(), webControl{network: n})
	for _, path := range []string{"/network", "/api/network", "/network/captures/" + name} {
		w := httptest.NewRecorder()
		app.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
		if w.Code != 200 {
			t.Fatalf("%s: %d %s", path, w.Code, w.Body.String())
		}
	}
	for _, tc := range []struct {
		body, origin, header string
		status               int
	}{
		{`{"duration_seconds":10}`, "", "", 400},
		{`{"duration_seconds":10}`, "https://other.example", "true", 403},
		{`{"duration_seconds":121}`, "", "true", 400},
		{`{"duration_seconds":1,"interface":"any"}`, "", "true", 400},
		{`{"duration_seconds":1}{}`, "", "true", 400},
	} {
		r := httptest.NewRequest("POST", "/api/network/start", strings.NewReader(tc.body))
		r.Header.Set("Origin", tc.origin)
		r.Header.Set("X-VM-Network", tc.header)
		w := httptest.NewRecorder()
		app.ServeHTTP(w, r)
		if w.Code != tc.status {
			t.Fatalf("start validation: %d %s", w.Code, w.Body.String())
		}
	}
	for _, path := range []string{"/network/captures/.active.json", "/network/captures/..%2Foutside.pcap", "/api/network/packets?file=/etc/passwd", "/api/network/packets?file=" + name + "&offset=bad"} {
		w := httptest.NewRecorder()
		app.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
		if w.Code < 400 {
			t.Fatalf("unsafe path accepted: %s", path)
		}
	}
	state := networkCapture{Filename: name, VM: n.vm, Adapter: 1, Status: "recording"}
	encoded, _ := json.Marshal(state)
	if err := os.WriteFile(filepath.Join(n.dir, ".active.json"), encoded, 0600); err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	app.ServeHTTP(w, httptest.NewRequest("GET", "/network/captures/"+name, nil))
	if w.Code != 409 {
		t.Fatal("active capture download was not blocked")
	}
	if _, err := exec.LookPath("sharkd"); err == nil {
		report, err := n.Packets(context.Background(), name, "udp", 0, 1)
		if err != nil || !report.Live || len(report.Packets) != 1 {
			t.Fatalf("live snapshot failed: %+v %v", report, err)
		}
	}
	if _, err := n.Start(context.Background(), 30); err == nil {
		t.Fatal("duplicate active capture was not blocked")
	}
}

func TestNetworkMCPDiscoveryAndReadOnlyStatus(t *testing.T) {
	n := testNetwork(t)
	networkFixture(t, n.dir)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	server := newMCPServer("Test VM", nil, nil, screenshotStore{dir: t.TempDir()}, n)
	clientTransport, serverTransport := mcp.NewInMemoryTransports()
	ss, err := server.Connect(ctx, serverTransport, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer ss.Close()
	client := mcp.NewClient(&mcp.Implementation{Name: "network-test"}, nil)
	session, err := client.Connect(ctx, clientTransport, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer session.Close()
	tools, err := session.ListTools(ctx, nil)
	if err != nil || len(tools.Tools) != 6 {
		t.Fatalf("network tools missing: %v %v", tools, err)
	}
	result, err := session.CallTool(ctx, &mcp.CallToolParams{Name: "network_status", Arguments: map[string]any{}})
	if err != nil || result.IsError {
		t.Fatal("network status failed", err)
	}
	for _, args := range []map[string]any{{"action": "start", "duration_seconds": 121}, {"action": "arbitrary"}} {
		result, err := session.CallTool(ctx, &mcp.CallToolParams{Name: "network_capture", Arguments: args})
		if err == nil && !result.IsError {
			t.Fatal("invalid capture tool call accepted")
		}
	}
}

func TestNetworkCaptureWorkerLifecycleWithFakeCLI(t *testing.T) {
	// Exercise the real subprocess/lock/signal/marker lifecycle without touching VirtualBox.
	moduleDir := t.TempDir()
	statePath := filepath.Join(moduleDir, "state.json")
	fixtureName := networkFixture(t, moduleDir)
	module := `#!/usr/bin/python3
import json,os,shutil,sys
from pathlib import Path
state_path=Path(os.environ['NETWORK_TEST_STATE'])
state=json.loads(state_path.read_text()) if state_path.exists() else {'traceFile':'original.pcap','traceEnabled':False}
args=sys.argv[1:]
if args==['showvminfo','Test VM']:
    print('State:                       running (since now)')
    print('NIC 1:                       MAC: 080027000001, Attachment: NAT, Cable connected: on, Trace: %s (file: %s), Type: 82540EM, Reported speed: 0 Mbps' % ('on' if state['traceEnabled'] else 'off',state['traceFile'] or 'none'))
elif args[:3]==['controlvm','Test VM','nictracefile1']:
    state['traceFile']=args[3];state_path.write_text(json.dumps(state))
elif args[:3]==['controlvm','Test VM','nictrace1']:
    state['traceEnabled']=args[3]=='on';state_path.write_text(json.dumps(state))
    if state['traceEnabled']: shutil.copyfile(os.environ['NETWORK_TEST_PCAP'],state['traceFile'])
else:
    print('Unexpected VBoxManage arguments',args,file=sys.stderr);sys.exit(1)
`
	if err := os.WriteFile(filepath.Join(moduleDir, "VBoxManage"), []byte(module), 0700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", moduleDir+string(os.PathListSeparator)+os.Getenv("PATH"))
	t.Setenv("VBOX_PYTHON", "/usr/bin/python3")
	t.Setenv("NETWORK_TEST_STATE", statePath)
	t.Setenv("NETWORK_TEST_PCAP", filepath.Join(moduleDir, fixtureName))
	n := testNetwork(t)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	details := recordingDetails{Name: "02 Unchanged Apply", Notes: "Opened app, pressed Apply once. No settings changed."}
	status, err := n.StartCapture(ctx, 30, "network", details)
	if err != nil || status.Active == nil {
		t.Fatalf("start failed: %+v %v", status, err)
	}
	if status.Active.Name != details.Name || status.Active.Notes != details.Notes {
		t.Fatalf("active recording lost metadata: %+v", status.Active)
	}
	other, err := newNetworkService(n.vm, filepath.Dir(n.dir), 1)
	if err != nil {
		t.Fatal(err)
	}
	defer other.Close()
	if _, err := other.Start(ctx, 30); err == nil {
		t.Fatal("second process/service was allowed to overwrite an active capture")
	}
	status, err = other.Stop(ctx)
	if err != nil || status.Active != nil || len(status.Captures) != 1 {
		t.Fatalf("cross-service stop failed: %+v %v", status, err)
	}
	if status.Captures[0].Name != details.Name || status.Captures[0].Notes != details.Notes || status.Captures[0].Ended == 0 {
		t.Fatalf("stopped recording lost metadata: %+v", status.Captures[0])
	}
	status, err = n.Start(ctx, 1)
	if err != nil {
		t.Fatal(err)
	}
	deadline := time.After(4 * time.Second)
	for status.Active != nil {
		select {
		case <-deadline:
			t.Fatal("duration limit did not stop capture")
		case <-time.After(50 * time.Millisecond):
		}
		status, err = n.Status()
		if err != nil {
			t.Fatal(err)
		}
	}
	if len(status.Captures) != 2 {
		t.Fatal("timed capture was not saved")
	}
	if _, err := n.Start(ctx, 30); err != nil {
		t.Fatal(err)
	}
	n.Close()
	status, err = n.Status()
	if err != nil || status.Active != nil || len(status.Captures) != 3 {
		t.Fatalf("shutdown cleanup failed: %+v %v", status, err)
	}
	var sdkState struct {
		TraceFile    string
		TraceEnabled bool
	}
	encoded, err := os.ReadFile(statePath)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(encoded, &sdkState); err != nil {
		t.Fatal(err)
	}
	if sdkState.TraceEnabled || sdkState.TraceFile != "original.pcap" {
		t.Fatal("CLI trace settings were not restored")
	}
}

func TestNetworkStartupFailureIncludesWorkerDiagnostics(t *testing.T) {
	launcher := filepath.Join(t.TempDir(), "failed-worker")
	if err := os.WriteFile(launcher, []byte("#!/bin/sh\nprintf 'worker diagnostic: launcher failed\\n' >&2\nexit 42\n"), 0700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("VBOX_PYTHON", launcher)
	n := testNetwork(t)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_, err := n.Start(ctx, 1)
	if err == nil || !strings.Contains(err.Error(), "worker diagnostic: launcher failed") || !strings.Contains(err.Error(), "exit status 42") {
		t.Fatalf("missing startup diagnostics: %v", err)
	}
	status, err := n.Status()
	if err != nil || status.Active != nil {
		t.Fatal("failed worker left an active capture")
	}
}

func TestUSBCaptureHTTPWorkerLifecycleWithFakeCLI(t *testing.T) {
	dir := t.TempDir()
	fixture := networkFixture(t, dir)
	script := `#!/usr/bin/python3
import json,os,shutil,sys
from pathlib import Path
p=Path(os.environ['USB_TEST_STATE'])
s=json.loads(p.read_text()) if p.exists() else {'attached':True}
u='01234567-1234-1234-1234-0123456789ab'
a=sys.argv[1:]
if a==['list','usbhost']:
 print('Host USB Devices:\n\nUUID: '+u+'\nVendorId: 0x30fa (30FA)\nProductId: 0x1440 (1440)\nCurrent State: Captured\n')
elif a==['showvminfo','Test VM']:
 print('State: running (since now)\nCurrently attached USB devices:\n\n'+('UUID: '+u+'\nVendorId: 0x30fa\n' if s['attached'] else '<none>\n'))
elif a[:3]==['controlvm','Test VM','usbdetach']:
 assert a[3]==u;s['attached']=False;p.write_text(json.dumps(s))
elif a[:3]==['controlvm','Test VM','usbattach']:
 assert a[3]==u;s['attached']=True;s['recording']=len(a)>4;p.write_text(json.dumps(s))
 if len(a)>4:
  assert len(a)==6 and a[4]=='--capturefile';shutil.copyfile(os.environ['USB_TEST_PCAP'],a[5])
else: raise RuntimeError(repr(a))
`
	if err := os.WriteFile(filepath.Join(dir, "VBoxManage"), []byte(script), 0700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", dir+string(os.PathListSeparator)+os.Getenv("PATH"))
	t.Setenv("USB_TEST_STATE", filepath.Join(dir, "state.json"))
	t.Setenv("USB_TEST_PCAP", filepath.Join(dir, fixture))
	t.Setenv("VM_USB_VENDOR", "30fa")
	t.Setenv("VM_USB_PRODUCT", "1440")
	n := testNetwork(t)
	app := newApp("Test VM", nil, t.TempDir(), webControl{network: n})
	notes := strings.Repeat("🖱", 2000)
	body, _ := json.Marshal(map[string]any{"source": "usb", "duration_seconds": 30, "name": "01 / Startup + unchanged Apply", "notes": notes})
	req := httptest.NewRequest("POST", "/api/network/start", bytes.NewReader(body))
	req.Header.Set("X-VM-Network", "true")
	w := httptest.NewRecorder()
	app.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	var status networkStatus
	if err := json.Unmarshal(w.Body.Bytes(), &status); err != nil {
		t.Fatal(err)
	}
	if status.Active == nil || status.Active.Source != "usb" || !strings.HasSuffix(status.Active.Filename, ".pcapng") {
		t.Fatalf("USB not started: %+v", status)
	}
	name := status.Active.Filename
	if status.Active.Name != "01 / Startup + unchanged Apply" || status.Active.Notes != notes || !strings.HasPrefix(name, "trace-01-startup-unchanged-apply-") {
		t.Fatalf("active name/notes: %+v", status.Active)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	status, err := n.Stop(ctx)
	if err != nil || status.Active != nil || len(status.Captures) != 1 || status.Captures[0].Source != "usb" {
		t.Fatalf("USB stop: %+v %v", status, err)
	}
	// Reload from disk through a fresh service; no in-memory catalog is needed.
	reopened, err := newNetworkService(n.vm, filepath.Dir(n.dir), n.adapter)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	loaded, err := reopened.Status()
	if err != nil || len(loaded.Captures) != 1 || loaded.Captures[0].Name != "01 / Startup + unchanged Apply" || loaded.Captures[0].Notes != notes {
		t.Fatalf("persisted metadata: %+v %v", loaded, err)
	}
	metadata, err := os.ReadFile(filepath.Join(n.dir, name+".json"))
	if err != nil {
		t.Fatal(err)
	}
	var saved networkCapture
	if err := json.Unmarshal(metadata, &saved); err != nil || saved.Name != loaded.Captures[0].Name || saved.Notes != notes || saved.Ended == 0 {
		t.Fatal("sidecar metadata missing", err)
	}
	// Repeated experiment names produce separate capture and metadata files.
	second, err := n.StartCapture(ctx, 30, "usb", recordingDetails{Name: saved.Name})
	if err != nil || second.Active == nil || second.Active.Filename == name {
		t.Fatalf("duplicate recording name collided: %+v %v", second, err)
	}
	if _, err := n.Stop(ctx); err != nil {
		t.Fatal(err)
	}
	var restored struct{ Attached, Recording bool }
	data, _ := os.ReadFile(filepath.Join(dir, "state.json"))
	json.Unmarshal(data, &restored)
	if !restored.Attached || restored.Recording {
		t.Fatalf("USB not restored: %s", data)
	}
}
