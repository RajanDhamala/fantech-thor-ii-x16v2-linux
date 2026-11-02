package main

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
)

func integer(n int) *int { return &n }

func TestInputAuthAndValidation(t *testing.T) {
	for _, tc := range []struct {
		name, token, origin, body string
		status                    int
	}{
		{"no token", "", "", `{"action":"key","key":"ENTER"}`, 401},
		{"wrong token", "bad", "", `{"action":"key","key":"ENTER"}`, 401},
		{"foreign origin", "secret", "http://attacker.example", `{"action":"key","key":"ENTER"}`, 403},
		{"valid", "secret", "http://example.com", `{"action":"key","key":"ENTER"}`, 200},
		{"unknown fields", "secret", "", `{"action":"key","key":"ENTER","command":"arbitrary"}`, 400},
		{"multiple objects", "secret", "", `{"action":"key","key":"ENTER"}{}`, 400},
		{"unsupported key", "secret", "", `{"action":"key","key":"INVALID"}`, 400},
		{"missing coordinate", "secret", "", `{"action":"click","x":0}`, 400},
		{"negative coordinate", "secret", "", `{"action":"move","x":-1,"y":0}`, 400},
		{"invalid button", "secret", "", `{"action":"click","x":0,"y":0,"button":"other"}`, 400},
		{"invalid wheel", "secret", "", `{"action":"scroll","x":0,"y":0,"wheel":100}`, 400},
		{"unicode", "secret", "", `{"action":"text","text":"नमस्ते"}`, 400},
		{"newline", "secret", "", `{"action":"text","text":"a\nb"}`, 400},
		{"too long", "secret", "", `{"action":"text","text":"` + strings.Repeat("a", 1001) + `"}`, 400},
	} {
		t.Run(tc.name, func(t *testing.T) {
			calls := 0
			app := newApp("VM", nil, t.TempDir(), webControl{token: "secret", send: func(ctx context.Context, a inputAction) error {
				calls++
				if _, ok := ctx.Deadline(); !ok {
					t.Error("input needs a deadline")
				}
				return nil
			}})
			r := httptest.NewRequest("POST", "/input", strings.NewReader(tc.body))
			r.Header.Set("X-Control-Token", tc.token)
			r.Header.Set("Origin", tc.origin)
			w := httptest.NewRecorder()
			app.ServeHTTP(w, r)
			if w.Code != tc.status {
				t.Fatalf("got %d: %s", w.Code, w.Body.String())
			}
			if (calls == 1) != (tc.status == 200) {
				t.Fatalf("unauthorized/invalid input dispatched: %d", calls)
			}
		})
	}
}

func TestInputIsScopedToConfiguredVM(t *testing.T) {
	var command string
	var args []string
	controller := &vmController{vm: "Only this VM", run: func(_ context.Context, cmd string, argv ...string) error {
		command, args = cmd, argv
		return nil
	}, capture: func(context.Context, string) ([]byte, error) { return testPNG(t), nil }}
	literal := "$(touch /tmp/do-not-execute); `id`"
	if err := controller.Input(context.Background(), inputAction{Action: "text", Text: literal}); err != nil {
		t.Fatal(err)
	}
	if command != "VBoxManage" || !reflect.DeepEqual(args, []string{"controlvm", "Only this VM", "keyboardputstring", literal}) {
		t.Fatalf("unexpected execution: %s %q", command, args)
	}
	if err := controller.Input(context.Background(), inputAction{Action: "key", Key: "ctrl+a"}); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(args, []string{"controlvm", "Only this VM", "keyboardputscancode", "1d", "1e", "9e", "9d"}) {
		t.Fatalf("incomplete key sequence: %q", args)
	}
	if err := controller.Input(context.Background(), inputAction{Action: "click", X: integer(15), Y: integer(8)}); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(args[2:], []string{"Only this VM", "click", "15", "8", "left", "1", "0"}) {
		t.Fatalf("unexpected mouse parameters: %q", args[2:])
	}
	controller.run = func(context.Context, string, ...string) error { t.Fatal("out-of-bounds input executed"); return nil }
	if err := controller.Input(context.Background(), inputAction{Action: "click", X: integer(16), Y: integer(8)}); err == nil {
		t.Fatal("out-of-bounds accepted")
	}
}

func TestInputFailureIsReportedWithoutPrivateOutput(t *testing.T) {
	app := newApp("VM", nil, t.TempDir(), webControl{token: "secret", send: func(context.Context, inputAction) error { return errors.New("private diagnostic") }})
	r := httptest.NewRequest("POST", "/input", strings.NewReader(`{"action":"key","key":"ENTER"}`))
	r.Header.Set("X-Control-Token", "secret")
	w := httptest.NewRecorder()
	app.ServeHTTP(w, r)
	if w.Code != http.StatusServiceUnavailable || strings.Contains(w.Body.String(), "private diagnostic") {
		t.Fatal("unexpected failure response")
	}
}
