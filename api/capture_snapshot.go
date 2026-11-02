package main

import (
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"os"
)

var errCapturePending = errors.New("waiting for capture header")

// Decode an immutable prefix: a capture writer may be halfway through its last
// record. Never hand that partial record to Wireshark or modify the original.
func captureSnapshot(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, (64<<20)+1))
	if err != nil {
		return "", err
	}
	if len(data) > 64<<20 {
		return "", fmt.Errorf("capture exceeds the 64 MB analysis limit")
	}
	if len(data) < 24 {
		return "", errCapturePending
	}
	var order binary.ByteOrder
	end := 0
	switch string(data[:4]) {
	case "\xd4\xc3\xb2\xa1", "\x4d\x3c\xb2\xa1":
		order = binary.LittleEndian
	case "\xa1\xb2\xc3\xd4", "\xa1\xb2\x3c\x4d":
		order = binary.BigEndian
	case "\x0a\x0d\x0d\x0a":
		for end+12 <= len(data) {
			if string(data[end:end+4]) == "\x0a\x0d\x0d\x0a" {
				switch string(data[end+8 : end+12]) {
				case "\x4d\x3c\x2b\x1a":
					order = binary.LittleEndian
				case "\x1a\x2b\x3c\x4d":
					order = binary.BigEndian
				default:
					return "", fmt.Errorf("invalid PCAPNG byte order")
				}
			}
			if order == nil {
				return "", fmt.Errorf("missing PCAPNG section header")
			}
			length := uint64(order.Uint32(data[end+4 : end+8]))
			if length < 12 || length%4 != 0 || length > 64<<20 {
				return "", fmt.Errorf("invalid PCAPNG block length")
			}
			if length > uint64(len(data)-end) {
				break
			}
			next := end + int(length)
			if order.Uint32(data[next-4:next]) != uint32(length) {
				return "", fmt.Errorf("invalid PCAPNG block trailer")
			}
			end = next
		}
		if end == 0 {
			return "", errCapturePending
		}
	default:
		return "", fmt.Errorf("unsupported capture format; expected PCAP or PCAPNG")
	}
	if end == 0 {
		end = 24
		for end+16 <= len(data) {
			length := uint64(order.Uint32(data[end+8 : end+12]))
			if length > 64<<20 {
				return "", fmt.Errorf("invalid PCAP record length")
			}
			if length+16 > uint64(len(data)-end) {
				break
			}
			end += 16 + int(length)
		}
	}
	temp, err := os.CreateTemp("", "screendrop-packets-*.pcap")
	if err != nil {
		return "", err
	}
	name := temp.Name()
	_, err = temp.Write(data[:end])
	closeErr := temp.Close()
	if err == nil {
		err = closeErr
	}
	if err != nil {
		os.Remove(name)
		return "", err
	}
	return name, nil
}
