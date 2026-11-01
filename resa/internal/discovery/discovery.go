package discovery

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

type Device struct {
	Node             string   `json:"node"`
	Sysfs            string   `json:"sysfs"`
	Bus              uint32   `json:"bus"`
	VID              uint32   `json:"vid"`
	PID              uint32   `json:"pid"`
	Name             string   `json:"name"`
	Manufacturer     string   `json:"manufacturer,omitempty"`
	Product          string   `json:"product,omitempty"`
	Interface        string   `json:"interface,omitempty"`
	USBPath          string   `json:"usb_path,omitempty"`
	DescriptorHex    string   `json:"descriptor_hex,omitempty"`
	DescriptorSHA256 string   `json:"descriptor_sha256,omitempty"`
	Reports          []Report `json:"reports"`
	Warnings         []string `json:"warnings,omitempty"`
}

// Scan reads sysfs attributes populated by the kernel during enumeration.
// No /dev node, USB request, feature ioctl, or input event stream is opened.
func Scan(root string, all bool) ([]Device, error) {
	entries, err := os.ReadDir(root)
	if err != nil {
		return nil, fmt.Errorf("read HID class: %w", err)
	}
	devices := []Device{}
	for _, entry := range entries {
		if !strings.HasPrefix(entry.Name(), "hidraw") {
			continue
		}
		d := Device{Node: filepath.Join("/dev", entry.Name()), Reports: []Report{}}
		path := filepath.Join(root, entry.Name(), "device")
		d.Sysfs, err = filepath.EvalSymlinks(path)
		if err != nil {
			return nil, fmt.Errorf("resolve %s: %w", path, err)
		}
		b, err := os.ReadFile(filepath.Join(d.Sysfs, "uevent"))
		if err != nil {
			return nil, fmt.Errorf("read %s uevent: %w", d.Sysfs, err)
		}
		values := map[string]string{}
		for _, line := range strings.Split(string(b), "\n") {
			if k, v, ok := strings.Cut(line, "="); ok {
				values[k] = v
			}
		}
		id := strings.Split(values["HID_ID"], ":")
		if len(id) != 3 {
			return nil, fmt.Errorf("invalid HID_ID at %s", d.Sysfs)
		}
		fields := []*uint32{&d.Bus, &d.VID, &d.PID}
		for i, part := range id {
			v, e := strconv.ParseUint(part, 16, 32)
			if e != nil {
				return nil, fmt.Errorf("invalid HID_ID at %s: %w", d.Sysfs, e)
			}
			*fields[i] = uint32(v)
		}
		if !all && (d.Bus != 3 || d.VID != 0x30fa || d.PID != 0x1440) {
			continue
		}
		d.Name = values["HID_NAME"]
		for p := d.Sysfs; p != filepath.Dir(p); p = filepath.Dir(p) {
			if d.Interface == "" {
				d.Interface = attribute(p, "bInterfaceNumber")
			}
			if attribute(p, "idVendor") != "" {
				d.USBPath = p
				d.Manufacturer = attribute(p, "manufacturer")
				d.Product = attribute(p, "product")
				break
			}
		}
		b, err = os.ReadFile(filepath.Join(d.Sysfs, "report_descriptor"))
		if err != nil {
			d.Warnings = append(d.Warnings, "cached report descriptor: "+err.Error())
		} else {
			d.DescriptorHex = hex.EncodeToString(b)
			d.DescriptorSHA256 = fmt.Sprintf("%x", sha256.Sum256(b))
			d.Reports, err = ParseDescriptor(b)
			if err != nil {
				d.Warnings = append(d.Warnings, "descriptor parse: "+err.Error())
			}
		}
		devices = append(devices, d)
	}
	return devices, nil
}

func attribute(path, name string) string {
	b, _ := os.ReadFile(filepath.Join(path, name))
	return strings.TrimSpace(string(b))
}
