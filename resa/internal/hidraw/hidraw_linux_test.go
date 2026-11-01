//go:build linux

package hidraw

import "testing"

func TestTransportRejectsEveryNonAllowlistedByte(t *testing.T) {
	baseline := [8]byte{7, 0x13, 0xff, 0xf3, 0x0b, 4, 0, 2}
	// A nil fd deliberately ensures forbidden packets are rejected before ioctl.
	e := &endpoint{}
	for index := range baseline {
		for value := 0; value < 256; value++ {
			if (index == 3 && value >= 0xf0 && value <= 0xf7) || (index == 5 && value <= 7) || byte(value) == baseline[index] {
				continue
			}
			report := baseline
			report[index] = byte(value)
			if _, err := e.SetLightingFeature(report); err == nil {
				t.Fatalf("accepted %x", report)
			}
		}
	}
}

func TestNodePathsCannotBeChosenFreely(t *testing.T) {
	for _, node := range []string{"/dev/null", "/tmp/hidraw2", "/dev/hidraw2/../null", "/dev/hidraw2\x00", "hidraw2"} {
		if _, err := Open(node); err == nil {
			t.Fatalf("accepted %q", node)
		}
	}
}
