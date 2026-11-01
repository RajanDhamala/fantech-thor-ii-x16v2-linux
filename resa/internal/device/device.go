// Package device exposes fixed, bounded X16v2 operations backed by capture data.
package device

import (
	"bytes"
	"context"
	_ "embed"
	"fmt"
	"os/exec"
	"runtime"
)

//go:embed worker.py
var worker string

// Run accepts typed JSON settings, never shell text, device paths or raw reports.
func Run(ctx context.Context, action string, input []byte) ([]byte, error) {
	if runtime.GOOS != "linux" || (runtime.GOARCH != "amd64" && runtime.GOARCH != "arm64") {
		return nil, fmt.Errorf("device operations require Linux amd64 or arm64")
	}
	switch action {
	case "read", "apply", "restore", "rgb":
	default:
		return nil, fmt.Errorf("unsupported device operation")
	}
	if len(input) > 8192 {
		return nil, fmt.Errorf("settings request is too large")
	}
	cmd := exec.CommandContext(ctx, "/usr/bin/python3", "-I", "-c", worker, action)
	cmd.Stdin = bytes.NewReader(input)
	var output, detail bytes.Buffer
	cmd.Stdout = &output
	cmd.Stderr = &detail
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("device operation failed or was interrupted; read mouse before retrying: %s %v", detail.String(), err)
	}
	if output.Len() > 32768 {
		return nil, fmt.Errorf("invalid device response size")
	}
	return output.Bytes(), nil
}
