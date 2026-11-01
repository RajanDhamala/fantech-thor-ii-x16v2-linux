package discovery

import (
	"fmt"
	"sort"
)

type Report struct {
	Kind string `json:"kind"`
	ID   uint32 `json:"id"`
	Bits uint64 `json:"payload_bits"`
	// ID-inclusive HID API buffer size: unnumbered reports use a zero prefix.
	BytesWithID uint64 `json:"bytes_with_id"`
}

// ParseDescriptor totals report fields, including padding. It deliberately does
// not infer vendor command semantics or authorize a report from its size.
func ParseDescriptor(b []byte) ([]Report, error) {
	type global struct{ size, count, id uint32 }
	g := global{}
	stack := []global{}
	totals := map[struct {
		kind string
		id   uint32
	}]uint64{}
	for i := 0; i < len(b); {
		prefix := b[i]
		i++
		if prefix == 0xfe {
			return nil, fmt.Errorf("unsupported long item at %d", i-1)
		}
		n := int(prefix & 3)
		if n == 3 {
			n = 4
		}
		if i+n > len(b) {
			return nil, fmt.Errorf("truncated item at %d", i-1)
		}
		var value uint32
		for j := 0; j < n; j++ {
			value |= uint32(b[i+j]) << (8 * j)
		}
		i += n
		typ, tag := (prefix>>2)&3, prefix>>4
		if typ == 1 {
			switch tag {
			case 7:
				g.size = value
			case 8:
				if value == 0 || value > 255 {
					return nil, fmt.Errorf("invalid report ID %d", value)
				}
				g.id = value
			case 9:
				g.count = value
			case 10:
				if len(stack) >= 64 {
					return nil, fmt.Errorf("global stack too deep")
				}
				stack = append(stack, g)
			case 11:
				if len(stack) == 0 {
					return nil, fmt.Errorf("global stack underflow")
				}
				g = stack[len(stack)-1]
				stack = stack[:len(stack)-1]
			}
		}
		if typ != 0 {
			continue
		}
		kind := ""
		switch tag {
		case 8:
			kind = "input"
		case 9:
			kind = "output"
		case 11:
			kind = "feature"
		}
		if kind == "" {
			continue
		}
		key := struct {
			kind string
			id   uint32
		}{kind, g.id}
		bits := uint64(g.size) * uint64(g.count)
		if bits > 8*65535 || totals[key]+bits > 8*65535 {
			return nil, fmt.Errorf("report exceeds 65535 payload bytes")
		}
		totals[key] += bits
	}
	if len(stack) != 0 {
		return nil, fmt.Errorf("unbalanced global stack")
	}
	result := []Report{}
	for k, bits := range totals {
		result = append(result, Report{k.kind, k.id, bits, (bits+7)/8 + 1})
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].Kind != result[j].Kind {
			return result[i].Kind < result[j].Kind
		}
		return result[i].ID < result[j].ID
	})
	return result, nil
}
