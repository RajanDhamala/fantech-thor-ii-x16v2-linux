package main

import (
	"bytes"
	"context"
	_ "embed"
	"fmt"
	"image/png"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"
)

//go:embed scripts/vm_mouse.py
var mouseBridge string

type inputAction struct {
	Action string `json:"action"`
	Text   string `json:"text,omitempty"`
	Key    string `json:"key,omitempty"`
	X      *int   `json:"x,omitempty"`
	Y      *int   `json:"y,omitempty"`
	Button string `json:"button,omitempty"`
	Clicks int    `json:"clicks,omitempty"`
	Wheel  int    `json:"wheel,omitempty"`
}

type inputFunc func(context.Context, inputAction) error
type commandFunc func(context.Context, string, ...string) error

type vmController struct {
	vm      string
	run     commandFunc
	capture captureFunc
	mu      sync.Mutex
}

// Each sequence is a complete press-and-release in PC/AT set 1 scancodes.
var keyCodes = map[string][]string{
	"ENTER": {"1c", "9c"}, "TAB": {"0f", "8f"}, "ESC": {"01", "81"},
	"BACKSPACE": {"0e", "8e"}, "DELETE": {"e0", "53", "e0", "d3"},
	"SPACE": {"39", "b9"}, "UP": {"e0", "48", "e0", "c8"},
	"DOWN": {"e0", "50", "e0", "d0"}, "LEFT": {"e0", "4b", "e0", "cb"},
	"RIGHT": {"e0", "4d", "e0", "cd"}, "WIN": {"e0", "5b", "e0", "db"},
	"CTRL+A": {"1d", "1e", "9e", "9d"}, "CTRL+C": {"1d", "2e", "ae", "9d"},
	"CTRL+V": {"1d", "2f", "af", "9d"}, "CTRL+S": {"1d", "1f", "9f", "9d"},
	"CTRL+Z": {"1d", "2c", "ac", "9d"}, "ALT+TAB": {"38", "0f", "8f", "b8"},
	"WIN+R": {"e0", "5b", "13", "93", "e0", "db"},
}

func validateInput(a inputAction) error {
	switch a.Action {
	case "text":
		if len(a.Text) == 0 || len(a.Text) > 1000 {
			return fmt.Errorf("text must contain 1–1000 printable US keyboard characters")
		}
		for _, ch := range a.Text {
			if ch < 32 || ch > 126 {
				return fmt.Errorf("text supports printable ASCII only; send Enter or Tab using the key action")
			}
		}
	case "key":
		if _, ok := keyCodes[strings.ToUpper(a.Key)]; !ok {
			return fmt.Errorf("unsupported key combination")
		}
	case "move", "click", "scroll":
		if a.X == nil || a.Y == nil || *a.X < 0 || *a.Y < 0 || *a.X > 32766 || *a.Y > 32766 {
			return fmt.Errorf("mouse actions require nonnegative x and y screenshot pixel coordinates")
		}
		if a.Action == "click" && a.Button != "" && a.Button != "left" && a.Button != "right" && a.Button != "middle" {
			return fmt.Errorf("button must be left, right or middle")
		}
		if a.Clicks < 0 || a.Clicks > 2 {
			return fmt.Errorf("clicks must be 1 or 2")
		}
		if a.Action == "scroll" && (a.Wheel == 0 || a.Wheel < -10 || a.Wheel > 10) {
			return fmt.Errorf("wheel must be between -10 and 10, excluding zero; positive scrolls down")
		}
	default:
		return fmt.Errorf("action must be text, key, move, click or scroll")
	}
	return nil
}

func (c *vmController) Capture(ctx context.Context, vm string) ([]byte, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.capture(ctx, c.vm)
}

func (c *vmController) Input(ctx context.Context, a inputAction) error {
	if err := validateInput(a); err != nil {
		return err
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if err := ctx.Err(); err != nil {
		return err
	}
	if a.Action == "text" {
		return c.run(ctx, "VBoxManage", "controlvm", c.vm, "keyboardputstring", a.Text)
	}
	if a.Action == "key" {
		args := append([]string{"controlvm", c.vm, "keyboardputscancode"}, keyCodes[strings.ToUpper(a.Key)]...)
		return c.run(ctx, "VBoxManage", args...)
	}
	// Validate against a fresh VM frame, never against an old gallery image.
	image, err := c.capture(ctx, c.vm)
	if err != nil {
		return fmt.Errorf("read current VM display: %w", err)
	}
	size, err := png.DecodeConfig(bytes.NewReader(image))
	if err != nil {
		return err
	}
	if *a.X >= size.Width || *a.Y >= size.Height {
		return fmt.Errorf("coordinates are outside the current %d × %d VM display; capture again", size.Width, size.Height)
	}
	button := a.Button
	if button == "" {
		button = "left"
	}
	clicks := a.Clicks
	if clicks == 0 {
		clicks = 1
	}
	return c.run(ctx, env("VBOX_PYTHON", "/usr/bin/python3"), "-c", mouseBridge,
		c.vm, a.Action, strconv.Itoa(*a.X), strconv.Itoa(*a.Y), button, strconv.Itoa(clicks), strconv.Itoa(a.Wheel))
}

func runInputCommand(ctx context.Context, name string, args ...string) error {
	cmd := exec.CommandContext(ctx, name, args...)
	// Let the Python bridge release buttons and its shared session on timeout.
	cmd.Cancel = func() error { return cmd.Process.Signal(os.Interrupt) }
	cmd.WaitDelay = 2 * time.Second
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("VM input: %w: %s", err, output)
	}
	return nil
}
