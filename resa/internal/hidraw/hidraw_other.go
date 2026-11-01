//go:build !linux

package hidraw

import "fmt"

func Open(string) (Endpoint, error) { return nil, fmt.Errorf("hidraw requires Linux") }
