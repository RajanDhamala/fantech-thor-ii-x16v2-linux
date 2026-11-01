package lighting

import (
	"encoding/hex"
	"errors"
	"resa/internal/discovery"
	"resa/internal/hidraw"
	"testing"
)

const configDescriptor = "05010906a1018503050719e029e71500250195087501810295067508150026ff000507190029e78100c0050c0901a101850219002a9c021500269c02950175108100c00600ff0901a1018506150026ff00092f950275088102c00601ff0901a1018507150026ff00092095077508b102c005010980a1018508198129831500250175019503810295058101c0"

func candidate() discovery.Device {
	return discovery.Device{Node: "/dev/hidraw2", Bus: 3, VID: 0x30fa, PID: 0x1440, Interface: "01", Product: "FANTECH-X16v2", DescriptorSHA256: DescriptorSHA256,
		Reports: []discovery.Report{{Kind: "feature", ID: 7, BytesWithID: 8}}}
}

type fakeEndpoint struct {
	metadata    hidraw.Metadata
	metadataErr error
	reports     [][8]byte
	n           int
	sendErr     error
	closed      bool
}

func (f *fakeEndpoint) Metadata() (hidraw.Metadata, error) { return f.metadata, f.metadataErr }
func (f *fakeEndpoint) SetLightingFeature(r [8]byte) (int, error) {
	f.reports = append(f.reports, r)
	return f.n, f.sendErr
}
func (f *fakeEndpoint) Close() error { f.closed = true; return nil }
func endpointFixture() *fakeEndpoint {
	descriptor, _ := hex.DecodeString(configDescriptor)
	return &fakeEndpoint{metadata: hidraw.Metadata{Bus: 3, VID: 0x30fa, PID: 0x1440, Descriptor: descriptor}, n: 8}
}

func TestAllReportCombinations(t *testing.T) {
	for brightness := 0; brightness <= 7; brightness++ {
		for speed := 0; speed <= 7; speed++ {
			got, err := Build(Settings{brightness, speed})
			want := [8]byte{7, 0x13, 0xff, 0xf0 | byte(speed), 0x0b, byte(brightness), 0, 2}
			if err != nil || got != want {
				t.Fatalf("%d/%d: %x %v", brightness, speed, got, err)
			}
		}
	}
	for _, s := range []Settings{{-1, 3}, {8, 3}, {4, -1}, {4, 8}} {
		if _, err := Build(s); err == nil {
			t.Fatalf("accepted %+v", s)
		}
	}
	plan, err := Plan(Settings{4, 3})
	if err != nil || plan.Status != "plan" || plan.ReportHex != "0713fff30b040002" || plan.EffectVerified {
		t.Fatalf("invalid plan: %+v %v", plan, err)
	}
}

func TestRejectBeforeOpening(t *testing.T) {
	wrong := candidate()
	wrong.Interface = "00"
	warning := candidate()
	warning.Warnings = []string{"partial descriptor"}
	changed := candidate()
	changed.DescriptorSHA256 = "other"
	wrongProduct := candidate()
	wrongProduct.Product = "other"
	noFeature := candidate()
	noFeature.Reports = nil
	for _, devices := range [][]discovery.Device{nil, {candidate(), candidate()}, {wrong}, {warning}, {changed}, {wrongProduct}, {noFeature}} {
		opened := false
		_, err := Apply(Settings{4, 3}, devices, func(string) (hidraw.Endpoint, error) { opened = true; return nil, errors.New("must not open") })
		if err == nil || opened {
			t.Fatalf("unsafe selection: %+v, opened %v", devices, opened)
		}
	}
	_, err := Apply(Settings{8, 3}, []discovery.Device{candidate()}, func(string) (hidraw.Endpoint, error) { t.Fatal("opened for invalid settings"); return nil, nil })
	if err == nil {
		t.Fatal("accepted invalid settings")
	}
}

func TestOpenedIdentityRecheck(t *testing.T) {
	for _, mutate := range []func(*fakeEndpoint){
		func(f *fakeEndpoint) { f.metadata.VID = 1 }, func(f *fakeEndpoint) { f.metadata.PID = 1 },
		func(f *fakeEndpoint) { f.metadata.Bus = 1 }, func(f *fakeEndpoint) { f.metadata.Descriptor[0] ^= 1 },
		func(f *fakeEndpoint) { f.metadataErr = errors.New("metadata failed") },
	} {
		f := endpointFixture()
		mutate(f)
		_, err := Apply(Settings{4, 3}, []discovery.Device{candidate()}, func(string) (hidraw.Endpoint, error) { return f, nil })
		if err == nil || len(f.reports) != 0 || !f.closed {
			t.Fatalf("identity rejection failed: %+v %v", f, err)
		}
	}
}

func TestExactlyOneSendNoRetry(t *testing.T) {
	for _, failure := range []string{"", "short", "error"} {
		t.Run(failure, func(t *testing.T) {
			f := endpointFixture()
			if failure == "short" {
				f.n = 7
			}
			if failure == "error" {
				f.sendErr = errors.New("transfer failed")
			}
			result, err := Apply(Settings{4, 3}, []discovery.Device{candidate()}, func(node string) (hidraw.Endpoint, error) {
				if node != "/dev/hidraw2" {
					t.Fatal(node)
				}
				return f, nil
			})
			if len(f.reports) != 1 || f.reports[0] != ([8]byte{7, 0x13, 0xff, 0xf3, 0x0b, 4, 0, 2}) || !f.closed {
				t.Fatalf("wrong transfer %+v", f)
			}
			if failure != "" {
				if err == nil {
					t.Fatal("accepted transfer failure")
				}
				return
			}
			if err != nil || result.Status != "sent-unverified" || result.EffectVerified || result.Bytes != 8 {
				t.Fatalf("result %+v %v", result, err)
			}
		})
	}
}
