package discovery

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDescriptorSizesAndGlobalStack(t *testing.T) {
	// Feature ID 7: seven bytes, plus padding nibble pair; push/pop must restore it.
	b := []byte{0x85, 7, 0x75, 8, 0x95, 7, 0xb1, 2, 0xa4, 0x85, 8, 0x75, 4, 0x95, 1, 0xb1, 2, 0xb1, 3, 0xb4, 0x81, 2}
	r, err := ParseDescriptor(b)
	if err != nil || len(r) != 3 {
		t.Fatalf("reports=%v err=%v", r, err)
	}
	if r[0].Kind != "feature" || r[0].ID != 7 || r[0].Bits != 56 || r[0].BytesWithID != 8 {
		t.Fatal(r)
	}
	if r[1].ID != 8 || r[1].Bits != 8 || r[1].BytesWithID != 2 {
		t.Fatal(r)
	}
	if r[2].Kind != "input" || r[2].ID != 7 || r[2].Bits != 56 {
		t.Fatal(r)
	}
}

func TestDescriptorRejectsMalformed(t *testing.T) {
	for _, b := range [][]byte{{0x75}, {0xb4}, {0xa4}, {0x85, 0}, {0xfe, 0, 0}, {0x77, 255, 255, 255, 255, 0x95, 255, 0xb1, 2}} {
		if _, err := ParseDescriptor(b); err == nil {
			t.Fatalf("accepted %x", b)
		}
	}
}

func TestScanCachedFixture(t *testing.T) {
	root := t.TempDir()
	write := func(path, value string) {
		t.Helper()
		p := filepath.Join(root, path)
		if err := os.MkdirAll(filepath.Dir(p), 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(value), 0600); err != nil {
			t.Fatal(err)
		}
	}
	for _, name := range []string{"hidraw0", "hidraw1"} {
		id := "0003:000030FA:00001440"
		if name == "hidraw1" {
			id = "0003:00001234:00005678"
		}
		write(name+"/device/uevent", "HID_ID="+id+"\nHID_NAME=fixture\n")
		write(name+"/device/report_descriptor", string([]byte{0x85, 7, 0x75, 8, 0x95, 7, 0xb1, 2}))
	}
	r, err := Scan(root, false)
	if err != nil || len(r) != 1 {
		t.Fatalf("devices=%v err=%v", r, err)
	}
	if r[0].VID != 0x30fa || r[0].PID != 0x1440 || len(r[0].Reports) != 1 || r[0].Reports[0].BytesWithID != 8 {
		t.Fatal(r)
	}
	r, err = Scan(root, true)
	if err != nil || len(r) != 2 {
		t.Fatalf("devices=%v err=%v", r, err)
	}
}
