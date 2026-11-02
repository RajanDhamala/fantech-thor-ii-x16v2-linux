package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDeleteRequiresConfirmationWithoutToken(t *testing.T) {
	for _, tc := range []struct {
		name, token, confirm, origin string
		status                       int
	}{
		{"no token", "", "true", "", 200},
		{"token is ignored", "wrong", "true", "", 200},
		{"no confirmation", "secret", "", "", 400},
		{"declined confirmation", "secret", "false", "", 400},
		{"foreign origin", "secret", "true", "https://other.example", 403},
		{"confirmed", "secret", "true", "http://example.com", 200},
	} {
		t.Run(tc.name, func(t *testing.T) {
			dir := t.TempDir()
			path := filepath.Join(dir, "saved.png")
			if err := os.WriteFile(path, testPNG(t), 0600); err != nil {
				t.Fatal(err)
			}
			app := newApp("Test VM", nil, dir)
			r := httptest.NewRequest("DELETE", "/screenshots/saved.png", nil)
			r.Header.Set("X-Control-Token", tc.token)
			r.Header.Set("X-Confirm-Delete", tc.confirm)
			r.Header.Set("Origin", tc.origin)
			w := httptest.NewRecorder()
			app.ServeHTTP(w, r)
			if w.Code != tc.status {
				t.Fatalf("got %d: %s", w.Code, w.Body.String())
			}
			_, err := os.Stat(path)
			if tc.status == 200 {
				if !os.IsNotExist(err) {
					t.Fatal("confirmed screenshot was not deleted")
				}
				if !strings.Contains(w.Body.String(), "No saved screenshots yet") || w.Header().Get("HX-Trigger-After-Settle") != "screenshotDeleted" {
					t.Fatal("missing empty gallery update")
				}
			} else if err != nil {
				t.Fatal("unconfirmed or cross-origin screenshot was removed")
			}
		})
	}
}

func TestDeleteRefreshesHistoryWithoutCapturing(t *testing.T) {
	dir := t.TempDir()
	for _, name := range []string{"first.png", "second.png"} {
		if err := os.WriteFile(filepath.Join(dir, name), testPNG(t), 0600); err != nil {
			t.Fatal(err)
		}
	}
	app := newApp("Test VM", func(context.Context, string) ([]byte, error) { t.Fatal("delete must not capture"); return nil, nil }, dir)
	r := httptest.NewRequest("DELETE", "/screenshots/second.png?selected=first.png", nil)
	r.Header.Set("X-Confirm-Delete", "true")
	w := httptest.NewRecorder()
	app.ServeHTTP(w, r)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `id="screenshot" src="/screenshots/first.png"`) || strings.Contains(w.Body.String(), "second.png") {
		t.Fatalf("stale preview/gallery: %d %s", w.Code, w.Body.String())
	}
	w = httptest.NewRecorder()
	app.ServeHTTP(w, httptest.NewRequest("GET", "/screenshots/second.png", nil))
	if w.Code != http.StatusNotFound {
		t.Fatal("deleted image is still served")
	}
	// Refreshing the page must keep the surviving history and show the modal.
	w = httptest.NewRecorder()
	app.ServeHTTP(w, httptest.NewRequest("GET", "/", nil))
	if !strings.Contains(w.Body.String(), `id="delete-dialog"`) || !strings.Contains(w.Body.String(), "1 saved screenshot") || strings.Contains(w.Body.String(), "second.png") {
		t.Fatal("deleted image returned on refresh or missing confirmation dialog")
	}
}

func TestDeleteRejectsUnsafeFiles(t *testing.T) {
	dir := t.TempDir()
	outside := filepath.Join(t.TempDir(), "outside.png")
	if err := os.WriteFile(outside, testPNG(t), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(dir, "linked.png")); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(dir, "folder.png"), 0700); err != nil {
		t.Fatal(err)
	}
	app := newApp("Test VM", nil, dir)
	for _, name := range []string{"linked.png", "folder.png", "missing.png", "notes.txt", "..%2Foutside.png"} {
		r := httptest.NewRequest("DELETE", "/screenshots/"+name, nil)
		r.Header.Set("X-Confirm-Delete", "true")
		w := httptest.NewRecorder()
		app.ServeHTTP(w, r)
		if w.Code != http.StatusNotFound {
			t.Errorf("%s: %d", name, w.Code)
		}
	}
	if _, err := os.Stat(outside); err != nil {
		t.Fatal("file outside gallery was removed")
	}
	if _, err := os.Lstat(filepath.Join(dir, "linked.png")); err != nil {
		t.Fatal("symlink was removed")
	}
}
