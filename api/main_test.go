package main

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/png"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func testPNG(t *testing.T) []byte {
	t.Helper()
	var buf bytes.Buffer
	if err := png.Encode(&buf, image.NewRGBA(image.Rect(0, 0, 16, 9))); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func TestCaptureResponses(t *testing.T) {
	image := testPNG(t)
	for _, tc := range []struct {
		name, method, path, contentType, contains string
		htmx                                      bool
	}{
		{"page", "GET", "/", "text/html", "Take screenshot", false},
		{"htmx preview", "POST", "/capture", "text/html", "/screenshots/screenshot-", true},
		{"form fallback", "POST", "/capture", "text/html", "<!doctype html>", false},
		{"raw PNG API", "GET", "/ss", "image/png", "", false},
		{"local CSS", "GET", "/static/app.css", "text/css", "", false},
		{"local HTMX", "GET", "/static/htmx.min.js", "javascript", "", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			calls := 0
			app := newApp("Test VM", func(ctx context.Context, vm string) ([]byte, error) {
				calls++
				if vm != "Test VM" {
					t.Errorf("wrong VM: %q", vm)
				}
				if _, ok := ctx.Deadline(); !ok {
					t.Error("capture must have a deadline")
				}
				return image, nil
			}, t.TempDir())
			req := httptest.NewRequest(tc.method, tc.path, nil)
			if tc.htmx {
				req.Header.Set("HX-Request", "true")
			}
			w := httptest.NewRecorder()
			app.ServeHTTP(w, req)
			if w.Code != http.StatusOK || !strings.Contains(w.Header().Get("Content-Type"), tc.contentType) {
				t.Fatalf("response: %d %s", w.Code, w.Header().Get("Content-Type"))
			}
			if !strings.Contains(w.Body.String(), tc.contains) {
				t.Errorf("missing %q", tc.contains)
			}
			if tc.path == "/ss" {
				if !bytes.Equal(w.Body.Bytes(), image) {
					t.Error("raw endpoint changed image bytes")
				}
			}
			if tc.path == "/ss" || tc.path == "/capture" {
				if calls != 1 || w.Header().Get("Cache-Control") != "no-store" {
					t.Errorf("capture calls=%d; cache=%q", calls, w.Header().Get("Cache-Control"))
				}
			} else if calls != 0 {
				t.Error("page or assets should not trigger capture")
			}
			if tc.htmx && (strings.Contains(w.Body.String(), "<html") || !strings.Contains(w.Body.String(), "16 × 9")) {
				t.Error("expected only preview fragment with dimensions")
			}
		})
	}
}

func TestCaptureErrors(t *testing.T) {
	for _, tc := range []struct {
		name   string
		image  []byte
		err    error
		status int
	}{
		{"VM unavailable", nil, errors.New("private command output"), http.StatusServiceUnavailable},
		{"invalid image", []byte("invalid PNG"), nil, http.StatusBadGateway},
	} {
		t.Run(tc.name, func(t *testing.T) {
			app := newApp("Test VM", func(context.Context, string) ([]byte, error) { return tc.image, tc.err }, t.TempDir())
			req := httptest.NewRequest("POST", "/capture", nil)
			req.Header.Set("HX-Request", "true")
			w := httptest.NewRecorder()
			app.ServeHTTP(w, req)
			if w.Code != tc.status || strings.Contains(w.Body.String(), "private command output") || strings.Contains(w.Body.String(), "<html") {
				t.Fatalf("unexpected error response: %d %s", w.Code, w.Body.String())
			}
			if !strings.Contains(w.Body.String(), "try again") {
				t.Error("expected actionable error")
			}
		})
	}
}

func TestCaptureBusy(t *testing.T) {
	started, release := make(chan struct{}), make(chan struct{})
	image := testPNG(t)
	app := newApp("Test VM", func(context.Context, string) ([]byte, error) {
		close(started)
		<-release
		return image, nil
	}, t.TempDir())
	done := make(chan struct{})
	go func() {
		defer close(done)
		app.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", "/ss", nil))
	}()
	<-started
	w := httptest.NewRecorder()
	app.ServeHTTP(w, httptest.NewRequest("POST", "/capture", nil))
	close(release)
	<-done
	if w.Code != http.StatusConflict {
		t.Errorf("concurrent capture returned %d", w.Code)
	}
}

func TestGalleryPersistsAcrossRestart(t *testing.T) {
	dir := t.TempDir()
	image := testPNG(t)
	store := screenshotStore{dir: dir}
	// Pick up PNGs saved by the original API too.
	if err := os.WriteFile(filepath.Join(dir, "vm-legacy.png"), image, 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "broken.png"), []byte("bad image"), 0600); err != nil {
		t.Fatal(err)
	}
	capture := func(context.Context, string) ([]byte, error) { return image, nil }
	app := newApp("Test VM", capture, dir)
	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/capture", nil)
	req.Header.Set("HX-Request", "true")
	app.ServeHTTP(w, req)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `hx-swap-oob="innerHTML"`) {
		t.Fatalf("capture must refresh gallery: %d %s", w.Code, w.Body.String())
	}
	// The raw PNG endpoint also adds to history.
	w = httptest.NewRecorder()
	app.ServeHTTP(w, httptest.NewRequest("GET", "/ss", nil))
	if w.Code != http.StatusOK || !bytes.Equal(w.Body.Bytes(), image) {
		t.Fatal("raw capture failed")
	}
	shots, err := store.list()
	if err != nil || len(shots) != 3 {
		t.Fatalf("saved gallery: %v, %v", shots, err)
	}
	for i := 1; i < len(shots); i++ {
		if shots[i].modified.After(shots[i-1].modified) {
			t.Fatal("gallery is not newest first")
		}
	}
	app = newApp("Test VM", func(context.Context, string) ([]byte, error) {
		t.Error("browsing old images should never capture")
		return nil, errors.New("unexpected capture")
	}, dir)
	w = httptest.NewRecorder()
	app.ServeHTTP(w, httptest.NewRequest("GET", "/?image=vm-legacy.png", nil))
	if !strings.Contains(w.Body.String(), "3 saved screenshots") || !strings.Contains(w.Body.String(), `id="screenshot" src="/screenshots/vm-legacy.png"`) {
		t.Fatal("page did not restore history and selected legacy image")
	}
	w = httptest.NewRecorder()
	app.ServeHTTP(w, httptest.NewRequest("GET", shots[0].Image+"?download=1", nil))
	if w.Code != http.StatusOK || !bytes.Equal(w.Body.Bytes(), image) || !strings.Contains(w.Header().Get("Content-Disposition"), "attachment;") {
		t.Fatal("saved image download failed")
	}
}

func TestScreenshotRouteRejectsUnsafeFiles(t *testing.T) {
	dir := t.TempDir()
	outside := filepath.Join(t.TempDir(), "outside.png")
	if err := os.WriteFile(outside, testPNG(t), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(dir, "linked.png")); err != nil {
		t.Fatal(err)
	}
	app := newApp("Test VM", nil, dir)
	for _, path := range []string{"/screenshots/linked.png", "/screenshots/missing.png", "/screenshots/notes.txt", "/screenshots/..%2Foutside.png"} {
		w := httptest.NewRecorder()
		app.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
		if w.Code != http.StatusNotFound {
			t.Errorf("%s returned %d", path, w.Code)
		}
	}
	shots, err := (screenshotStore{dir: dir}).list()
	if err != nil || len(shots) != 0 {
		t.Fatal("symlinks must not appear in gallery")
	}
}

func TestCaptureSaveFailure(t *testing.T) {
	image := testPNG(t)
	app := newApp("Test VM", func(context.Context, string) ([]byte, error) { return image, nil }, filepath.Join(t.TempDir(), "missing"))
	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/capture", nil)
	req.Header.Set("HX-Request", "true")
	app.ServeHTTP(w, req)
	if w.Code != http.StatusInternalServerError || !strings.Contains(w.Body.String(), "Couldn’t save") {
		t.Fatalf("save failure response: %d %s", w.Code, w.Body.String())
	}
}
