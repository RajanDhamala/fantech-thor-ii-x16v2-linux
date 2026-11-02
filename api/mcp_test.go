package main

import (
	"bytes"
	"context"
	"testing"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestMCPToolsOverRealSDKSession(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	image := testPNG(t)
	store := screenshotStore{dir: t.TempDir()}
	var inputs []inputAction
	server := newMCPServer("Test VM", func(context.Context, string) ([]byte, error) { return image, nil },
		func(_ context.Context, a inputAction) error { inputs = append(inputs, a); return nil }, store)
	clientTransport, serverTransport := mcp.NewInMemoryTransports()
	serverSession, err := server.Connect(ctx, serverTransport, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer serverSession.Close()
	client := mcp.NewClient(&mcp.Implementation{Name: "test-client", Version: "1"}, nil)
	session, err := client.Connect(ctx, clientTransport, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer session.Close()
	tools, err := session.ListTools(ctx, nil)
	if err != nil || len(tools.Tools) != 3 {
		t.Fatalf("tool discovery: %v %v", tools, err)
	}
	result, err := session.CallTool(ctx, &mcp.CallToolParams{Name: "screenshot", Arguments: map[string]any{}})
	if err != nil || result.IsError || len(result.Content) != 2 {
		t.Fatalf("screenshot: %v %v", result, err)
	}
	content, ok := result.Content[1].(*mcp.ImageContent)
	if !ok || content.MIMEType != "image/png" || !bytes.Equal(content.Data, image) {
		t.Fatal("MCP screenshot must contain the actual PNG image")
	}
	shots, err := store.list()
	if err != nil || len(shots) != 1 {
		t.Fatal("MCP screenshot was not saved to gallery")
	}
	for _, tc := range []struct {
		name  string
		args  map[string]any
		valid bool
	}{
		{"keyboard_input", map[string]any{"action": "text", "text": "hello"}, true},
		{"keyboard_input", map[string]any{"action": "key", "key": "CTRL+A"}, true},
		{"keyboard_input", map[string]any{"action": "click"}, false},
		{"keyboard_input", map[string]any{"action": "text", "text": "\n"}, false},
		{"mouse_control", map[string]any{"action": "click", "x": 0, "y": 0}, true},
		{"mouse_control", map[string]any{"action": "move", "x": -1, "y": 0}, false},
		{"mouse_control", map[string]any{"action": "click", "x": 0}, false},
		{"mouse_control", map[string]any{"action": "text", "x": 0, "y": 0}, false},
	} {
		before := len(inputs)
		result, err := session.CallTool(ctx, &mcp.CallToolParams{Name: tc.name, Arguments: tc.args})
		if tc.valid {
			if err != nil || result.IsError || len(inputs) != before+1 {
				t.Fatalf("valid tool call failed: %s %v %v", tc.name, result, err)
			}
		} else if (err == nil && !result.IsError) || len(inputs) != before {
			t.Fatalf("invalid tool call dispatched: %s %v", tc.name, tc.args)
		}
	}
}
