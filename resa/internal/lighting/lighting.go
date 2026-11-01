// Package lighting implements one explicitly experimental vendor lighting path.
// It does not replay Apply or expose command 0x18, palette writes, or firmware.
package lighting

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"

	"resa/internal/discovery"
	"resa/internal/hidraw"
)

const DescriptorSHA256 = "0ec3eb2dc293bd8edcb490f5cee9ab272ebec8f4e0edc5f9f365f1bab53b2018"

type Settings struct {
	Brightness int `json:"brightness"`
	Speed      int `json:"speed"`
}

type Result struct {
	Status         string   `json:"status"`
	Experimental   bool     `json:"experimental"`
	Settings       Settings `json:"settings"`
	ReportHex      string   `json:"report_hex"`
	Node           string   `json:"node,omitempty"`
	Bytes          int      `json:"bytes,omitempty"`
	EffectVerified bool     `json:"effect_verified"`
	Note           string   `json:"note"`
}

// Build follows FUN_00429dc0 and the complete caller at 0x4448a0, using the
// packaged ShareData baseline. Only brightness/timing vary, each 0..7.
// This selects vendor mode 7; it does not preserve or read current device state.
func Build(s Settings) ([8]byte, error) {
	if s.Brightness < 0 || s.Brightness > 7 || s.Speed < 0 || s.Speed > 7 {
		return [8]byte{}, fmt.Errorf("brightness and speed must each be an integer from 0 to 7")
	}
	return [8]byte{7, 0x13, 0xff, 0xf0 | byte(s.Speed), 0x0b, byte(s.Brightness), 0, 2}, nil
}

func Plan(s Settings) (Result, error) {
	report, err := Build(s)
	if err != nil {
		return Result{}, err
	}
	return Result{Status: "plan", Experimental: true, Settings: s, ReportHex: hex.EncodeToString(report[:]),
		Note: "Vendor default lighting mode 7; one feature report. Hardware effect and persistence are unverified; current lighting state is not read or backed up."}, nil
}

func Matches(d discovery.Device) bool {
	if d.Bus != 3 || d.VID != 0x30fa || d.PID != 0x1440 || d.Interface != "01" || d.Product != "FANTECH-X16v2" || d.DescriptorSHA256 != DescriptorSHA256 || len(d.Warnings) != 0 {
		return false
	}
	for _, report := range d.Reports {
		if report.Kind == "feature" && report.ID == 7 && report.BytesWithID == 8 {
			return true
		}
	}
	return false
}

// Apply rechecks identity on the opened fd before transmitting exactly one
// allowlisted report. Transport acceptance does not prove a visible effect.
func Apply(s Settings, devices []discovery.Device, open func(string) (hidraw.Endpoint, error)) (Result, error) {
	result, err := Plan(s)
	if err != nil {
		return Result{}, err
	}
	var matches []discovery.Device
	for _, device := range devices {
		if Matches(device) {
			matches = append(matches, device)
		}
	}
	if len(matches) != 1 {
		return Result{}, fmt.Errorf("need exactly one matching X16v2 configuration interface; found %d", len(matches))
	}
	device, err := open(matches[0].Node)
	if err != nil {
		return Result{}, err
	}
	defer device.Close()
	metadata, err := device.Metadata()
	if err != nil {
		return Result{}, err
	}
	if metadata.Bus != 3 || metadata.VID != 0x30fa || metadata.PID != 0x1440 || fmt.Sprintf("%x", sha256.Sum256(metadata.Descriptor)) != DescriptorSHA256 {
		return Result{}, fmt.Errorf("opened device identity or cached descriptor does not match; no report sent")
	}
	report, _ := Build(s)
	n, err := device.SetLightingFeature(report)
	if err != nil {
		return Result{}, fmt.Errorf("feature transfer failed; hardware state is unknown (no retry): %w", err)
	}
	if n != len(report) {
		return Result{}, fmt.Errorf("feature transfer returned %d of 8 bytes; hardware state is unknown (no retry)", n)
	}
	result.Status = "sent-unverified"
	result.Node = matches[0].Node
	result.Bytes = n
	result.Note = "Kernel accepted one lighting report. Check the mouse visually; effect and persistence were not read back."
	return result, nil
}
