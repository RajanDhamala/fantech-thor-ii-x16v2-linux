// Package hidraw contains the restricted feature-report transport. Device reads
// here retrieve kernel metadata; there is no input stream or memory-read API.
package hidraw

type Metadata struct {
	Bus        uint32
	VID, PID   uint16
	Descriptor []byte
}

type Endpoint interface {
	Metadata() (Metadata, error)
	SetLightingFeature([8]byte) (int, error)
	Close() error
}
