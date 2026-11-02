package main

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestLiveCaptureSnapshotIgnoresIncompleteRecordAndResumes(t *testing.T) {
	if _, err := exec.LookPath("sharkd"); err != nil {
		t.Skip("sharkd unavailable")
	}
	n := testNetwork(t)
	name := networkFixture(t, n.dir)
	path := filepath.Join(n.dir, name)
	full, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	state, _ := json.Marshal(networkCapture{Filename: name, VM: n.vm, Adapter: 1, Source: "network"})
	if err := os.WriteFile(filepath.Join(n.dir, ".active.json"), state, 0600); err != nil {
		t.Fatal(err)
	}
	// Two complete records and only part of the third payload.
	if err := os.WriteFile(path, full[:len(full)-5], 0600); err != nil {
		t.Fatal(err)
	}
	first, err := n.packetsSince(context.Background(), name, "udp", 0, 1, 0)
	if err != nil || !first.Live || first.Total != 2 || !first.More || first.Cursor != 1 || len(first.Packets) != 1 {
		t.Fatalf("first: %+v %v", first, err)
	}
	second, err := n.packetsSince(context.Background(), name, "udp", 0, 100, first.Cursor)
	if err != nil || second.Cursor != 2 || len(second.Packets) != 1 || second.Packets[0].Number != 2 {
		t.Fatalf("second: %+v %v", second, err)
	}
	if err := os.WriteFile(path, full, 0600); err != nil {
		t.Fatal(err)
	}
	third, err := n.packetsSince(context.Background(), name, "udp", 0, 100, second.Cursor)
	if err != nil || third.Cursor != 3 || len(third.Packets) != 1 || third.Packets[0].Number != 3 {
		t.Fatalf("third: %+v %v", third, err)
	}
	empty, err := n.packetsSince(context.Background(), name, "tcp", 0, 100, 0)
	if err != nil || empty.Cursor != 3 || len(empty.Packets) != 0 {
		t.Fatalf("nonmatching cursor: %+v %v", empty, err)
	}
	unchanged, _ := os.ReadFile(path)
	if !bytes.Equal(unchanged, full) {
		t.Fatal("snapshot changed original")
	}
	// Valid filters on the installed decoder, including USB/HID/vendor transfer presets.
	for _, filter := range []string{"usb.transfer_type == 0x02", "usb || usbhid", "usbhid", "usb.transfer_type == 0x01", "usb.transfer_type == 0x03", "dns || tcp || udp || icmp || icmpv6 || arp", "http || http2"} {
		if _, err := n.Packets(context.Background(), name, filter, 0, 10); err != nil {
			t.Errorf("%s: %v", filter, err)
		}
	}
}

func TestCaptureSnapshotPCAPNGCompleteBlocksAndEndian(t *testing.T) {
	for _, order := range []binary.ByteOrder{binary.LittleEndian, binary.BigEndian} {
		t.Run("byte-order", func(t *testing.T) {
			block := func(kind uint32, body []byte) []byte {
				data := make([]byte, 12+len(body))
				order.PutUint32(data, kind)
				order.PutUint32(data[4:], uint32(len(data)))
				copy(data[8:], body)
				order.PutUint32(data[len(data)-4:], uint32(len(data)))
				return data
			}
			body := make([]byte, 16)
			order.PutUint32(body, 0x1a2b3c4d)
			order.PutUint16(body[4:], 1)
			header := block(0x0a0d0d0a, body)
			iface := block(1, make([]byte, 8))
			partial := block(6, make([]byte, 24))
			full := append(append(append([]byte{}, header...), iface...), partial...)
			path := filepath.Join(t.TempDir(), "growing.pcapng")
			if err := os.WriteFile(path, full[:len(full)-3], 0600); err != nil {
				t.Fatal(err)
			}
			snapshot, err := captureSnapshot(path)
			if err != nil {
				t.Fatal(err)
			}
			defer os.Remove(snapshot)
			got, _ := os.ReadFile(snapshot)
			if !bytes.Equal(got, full[:len(header)+len(iface)]) {
				t.Fatalf("partial block leaked: %x", got)
			}
		})
	}
}

func TestLiveUSBPCAPNGWithInstalledDecoder(t *testing.T) {
	if _, err := exec.LookPath("sharkd"); err != nil {
		t.Skip("sharkd unavailable")
	}
	n := testNetwork(t)
	// A Linux USB header with an outgoing SET_REPORT feature request, stored as
	// PCAPNG. The fixed fixture is decoder evidence, not a physical-device test.
	order := binary.LittleEndian
	block := func(kind uint32, body []byte) []byte {
		data := make([]byte, 12+len(body))
		order.PutUint32(data, kind)
		order.PutUint32(data[4:], uint32(len(data)))
		copy(data[8:], body)
		order.PutUint32(data[len(data)-4:], uint32(len(data)))
		return data
	}
	shb := make([]byte, 16)
	order.PutUint32(shb, 0x1a2b3c4d)
	order.PutUint16(shb[4:], 1)
	idb := make([]byte, 8)
	order.PutUint16(idb, 220)
	order.PutUint32(idb[4:], 65535)
	usb := make([]byte, 72)
	order.PutUint64(usb, 1)
	usb[8] = 'S'
	usb[9] = 2
	usb[11] = 3
	order.PutUint16(usb[12:], 1)
	usb[15] = 0
	order.PutUint32(usb[36:], 8)
	copy(usb[40:], []byte{0x21, 9, 7, 3, 1, 0, 8, 0})
	copy(usb[64:], []byte{7, 0x13, 0xff, 0xf3, 0xb, 4, 0, 2})
	epb := make([]byte, 20+len(usb))
	order.PutUint32(epb[8:], 1000000)
	order.PutUint32(epb[12:], uint32(len(usb)))
	order.PutUint32(epb[16:], uint32(len(usb)))
	copy(epb[20:], usb)
	data := append(block(0x0a0d0d0a, shb), block(1, idb)...)
	data = append(data, block(6, epb)...)
	name := "trace-usb-fixture.pcapng"
	path := filepath.Join(n.dir, name)
	if err := os.WriteFile(path, data, 0600); err != nil {
		t.Fatal(err)
	}
	state, _ := json.Marshal(networkCapture{Filename: name, VM: n.vm, Adapter: 1, Source: "usb"})
	if err := os.WriteFile(filepath.Join(n.dir, ".active.json"), state, 0600); err != nil {
		t.Fatal(err)
	}
	report, err := n.Packets(context.Background(), name, "usb.transfer_type == 0x02", 0, 100)
	if err != nil || report.Total != 1 || len(report.Packets) != 1 || !report.Live {
		t.Fatalf("USB report: %+v %v", report, err)
	}
	if !validCaptureName(name) || validCaptureName("../"+name) {
		t.Fatal("invalid PCAPNG path validation")
	}
	t.Logf("USB decoded: %v", report.Packets[0].Columns)
}
