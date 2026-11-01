//go:build linux

package hidraw

import (
	"fmt"
	"os"
	"regexp"
	"runtime"
	"syscall"
	"unsafe"
)

// Linux asm-generic ioctl encoding, supported here on amd64 and arm64 only.
// Definitions: include/uapi/linux/hidraw.h. No hidraw write() or GET_FEATURE.
const (
	getDescriptorSize = 0x80044801
	getDescriptor     = 0x90044802
	getRawInfo        = 0x80084803
	setFeature8       = 0xc0084806
)

var nodePattern = regexp.MustCompile(`^/dev/hidraw[0-9]+$`)

type endpoint struct{ file *os.File }

func Open(node string) (Endpoint, error) {
	if runtime.GOARCH != "amd64" && runtime.GOARCH != "arm64" {
		return nil, fmt.Errorf("experimental hidraw transport supports Linux amd64/arm64 only")
	}
	if !nodePattern.MatchString(node) {
		return nil, fmt.Errorf("invalid hidraw node")
	}
	fd, err := syscall.Open(node, syscall.O_RDWR|syscall.O_CLOEXEC|syscall.O_NOFOLLOW|syscall.O_NONBLOCK, 0)
	if err != nil {
		return nil, fmt.Errorf("open %s as your normal user: %w", node, err)
	}
	file := os.NewFile(uintptr(fd), node)
	stat, err := file.Stat()
	if err != nil || stat.Mode()&os.ModeCharDevice == 0 {
		file.Close()
		return nil, fmt.Errorf("%s is not an accessible character device", node)
	}
	if err := syscall.Flock(fd, syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		file.Close()
		return nil, fmt.Errorf("mouse is busy: %w", err)
	}
	return &endpoint{file: file}, nil
}

func (e *endpoint) ioctl(request uintptr, pointer unsafe.Pointer) (int, error) {
	n, _, errno := syscall.Syscall(syscall.SYS_IOCTL, e.file.Fd(), request, uintptr(pointer))
	runtime.KeepAlive(pointer)
	runtime.KeepAlive(e.file)
	if errno != 0 {
		return 0, errno
	}
	return int(n), nil
}

func (e *endpoint) Metadata() (Metadata, error) {
	var info struct {
		Bus      uint32
		VID, PID uint16
	}
	if _, err := e.ioctl(getRawInfo, unsafe.Pointer(&info)); err != nil {
		return Metadata{}, fmt.Errorf("HIDIOCGRAWINFO: %w", err)
	}
	var size int32
	if _, err := e.ioctl(getDescriptorSize, unsafe.Pointer(&size)); err != nil {
		return Metadata{}, fmt.Errorf("HIDIOCGRDESCSIZE: %w", err)
	}
	if size <= 0 || size > 4096 {
		return Metadata{}, fmt.Errorf("invalid descriptor size %d", size)
	}
	var descriptor struct {
		Size  uint32
		Bytes [4096]byte
	}
	descriptor.Size = uint32(size)
	if _, err := e.ioctl(getDescriptor, unsafe.Pointer(&descriptor)); err != nil {
		return Metadata{}, fmt.Errorf("HIDIOCGRDESC: %w", err)
	}
	if descriptor.Size != uint32(size) {
		return Metadata{}, fmt.Errorf("descriptor size changed during verification")
	}
	return Metadata{Bus: info.Bus, VID: info.VID, PID: info.PID, Descriptor: append([]byte(nil), descriptor.Bytes[:size]...)}, nil
}

func (e *endpoint) SetLightingFeature(report [8]byte) (int, error) {
	// A second boundary: this transport cannot send arbitrary commands, addresses,
	// palette reports, or memory transactions even if its caller is changed.
	if report[0] != 7 || report[1] != 0x13 || report[2] != 0xff || report[3] < 0xf0 || report[3] > 0xf7 || report[4] != 0x0b || report[5] > 7 || report[6] != 0 || report[7] != 2 {
		return 0, fmt.Errorf("report outside the experimental lighting allowlist")
	}
	return e.ioctl(setFeature8, unsafe.Pointer(&report[0]))
}

func (e *endpoint) Close() error { return e.file.Close() }
