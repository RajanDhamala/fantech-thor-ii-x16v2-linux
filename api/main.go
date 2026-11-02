package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"embed"
	"flag"
	"fmt"
	"html/template"
	"image/png"
	"io"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strconv"
	"syscall"
	"time"
)

//go:embed templates/*.html static/*
var files embed.FS

var views = template.Must(template.ParseFS(files, "templates/*.html"))

type captureFunc func(context.Context, string) ([]byte, error)

type pageData struct {
	screenshot
	VM       string
	Gallery  []screenshot
	Error    string
	Controls bool
	Network  bool
}

func main() {
	mcpMode := flag.Bool("mcp", false, "serve MCP tools over stdio instead of starting the web server")
	flag.Parse()
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	addr := env("LISTEN_ADDR", "0.0.0.0:3030")
	vm := env("VM_NAME", "Win !0")
	dir := env("SCREENSHOT_DIR", "assets")
	if err := os.MkdirAll(dir, 0750); err != nil {
		log.Fatal("Create screenshot directory: ", err)
	}
	controller := &vmController{vm: vm, run: runInputCommand, capture: captureVM}
	adapter, err := strconv.Atoi(env("VM_NETWORK_ADAPTER", "1"))
	if err != nil {
		log.Fatal("VM_NETWORK_ADAPTER must be a number")
	}
	network, err := newNetworkService(vm, env("CAPTURE_DIR", "captures"), adapter)
	if err != nil {
		log.Fatal(err)
	}
	defer network.Close()
	if *mcpMode {
		if err := runMCP(ctx, controller, screenshotStore{dir: dir}, network); err != nil && ctx.Err() == nil {
			log.Print(err)
		}
		return
	}
	token := env("CONTROL_TOKEN", rand.Text())
	log.Printf("Web control token (enter in the control panel): %s", token)
	log.Printf("Capturing VirtualBox VM %q", vm)
	log.Printf("Local: http://localhost%s", portSuffix(addr))
	if addrs, err := net.InterfaceAddrs(); err == nil {
		for _, addrIP := range addrs {
			if ip, ok := addrIP.(*net.IPNet); ok && ip.IP.To4() != nil && ip.IP.IsPrivate() {
				log.Printf("LAN: http://%s%s", ip.IP, portSuffix(addr))
			}
		}
	}
	server := &http.Server{
		Addr: addr, Handler: newApp(vm, controller.Capture, dir, webControl{token: token, send: controller.Input, network: network}),
		ReadHeaderTimeout: 5 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		server.Shutdown(shutdown)
	}()
	log.Printf("Listening on %s", addr)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

func newApp(vm string, capture captureFunc, dir string, controls ...webControl) http.Handler {
	mux := http.NewServeMux()
	control := webControl{}
	if len(controls) > 0 {
		control = controls[0]
	}
	control.register(mux)
	if control.network != nil {
		control.network.registerHTTP(mux)
	}
	store := screenshotStore{dir: dir}
	loadPage := func() pageData {
		data := pageData{VM: vm, Controls: control.send != nil, Network: control.network != nil}
		var err error
		data.Gallery, err = store.list()
		if err != nil {
			log.Printf("Read gallery: %v", err)
			data.Error = "Couldn’t read the saved screenshots. Check the screenshot folder and try again."
		}
		if len(data.Gallery) > 0 {
			data.screenshot = data.Gallery[0]
		}
		return data
	}
	static, err := fs.Sub(files, "static")
	if err != nil {
		panic(err)
	}
	mux.Handle("GET /static/", http.StripPrefix("/static/", http.FileServer(http.FS(static))))
	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) {
		data := loadPage()
		for _, shot := range data.Gallery {
			if shot.Filename == r.URL.Query().Get("image") {
				data.screenshot = shot
				break
			}
		}
		render(w, "page", data)
	})
	mux.HandleFunc("GET /screenshots/{name}", func(w http.ResponseWriter, r *http.Request) {
		name := r.PathValue("name")
		if !validScreenshotName(name) {
			http.NotFound(w, r)
			return
		}
		path := filepath.Join(dir, name)
		info, err := os.Lstat(path)
		if err != nil || !info.Mode().IsRegular() {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Cache-Control", "private, max-age=86400")
		w.Header().Set("Content-Type", "image/png")
		if r.URL.Query().Get("download") == "1" {
			w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", name))
		}
		http.ServeFile(w, r, path)
	})

	mux.HandleFunc("DELETE /screenshots/{name}", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		fail := func(status int, message string) {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.WriteHeader(status)
			render(w, "capture-error", pageData{Error: message})
		}
		if status, message := checkOrigin(r); status != 0 {
			fail(status, message)
			return
		}
		if r.Header.Get("X-Confirm-Delete") != "true" {
			fail(http.StatusBadRequest, "Confirm deletion in the popup first.")
			return
		}
		if err := store.delete(r.PathValue("name")); err != nil {
			if os.IsNotExist(err) {
				fail(http.StatusNotFound, "Screenshot not found. It may already have been deleted; refresh the gallery.")
			} else {
				log.Printf("Delete screenshot: %v", err)
				fail(http.StatusInternalServerError, "Couldn’t delete the screenshot. Check folder permissions and try again.")
			}
			return
		}
		data := loadPage()
		for _, shot := range data.Gallery {
			if shot.Filename == r.URL.Query().Get("selected") {
				data.screenshot = shot
				break
			}
		}
		w.Header().Set("HX-Trigger-After-Settle", "screenshotDeleted")
		render(w, "capture-result", data)
	})

	// Both the HTMX page and the original PNG endpoint use the same capture path.
	busy := make(chan struct{}, 1)
	handleCapture := func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		data := pageData{VM: vm}
		fail := func(status int, message string) {
			if r.URL.Path != "/ss" && r.Header.Get("HX-Request") != "true" {
				data = loadPage()
			}
			data.Error = message
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			if r.URL.Path == "/ss" {
				w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			}
			w.WriteHeader(status)
			if r.URL.Path == "/ss" {
				fmt.Fprintln(w, message)
			} else if r.Header.Get("HX-Request") == "true" {
				render(w, "capture-error", data)
			} else {
				render(w, "page", data)
			}
		}
		select {
		case busy <- struct{}{}:
			defer func() { <-busy }()
		default:
			fail(http.StatusConflict, "A capture is already in progress. Try again in a moment.")
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
		defer cancel()
		image, err := capture(ctx, vm)
		if err != nil {
			log.Printf("Screenshot failed for %q: %v", vm, err)
			fail(http.StatusServiceUnavailable, "Couldn’t capture the VM. Make sure VirtualBox is available and the selected VM is running, then try again.")
			return
		}
		_, err = png.DecodeConfig(bytes.NewReader(image))
		if err != nil {
			log.Printf("Invalid screenshot: %v", err)
			fail(http.StatusBadGateway, "The VM returned an invalid screenshot. Please try again.")
			return
		}
		shot, err := store.save(image)
		if err != nil {
			log.Printf("Save screenshot: %v", err)
			fail(http.StatusInternalServerError, "Couldn’t save the screenshot. Check available disk space and folder permissions, then try again.")
			return
		}
		data.screenshot = shot
		if r.URL.Path == "/ss" {
			w.Header().Set("Content-Type", "image/png")
			w.Header().Set("Content-Disposition", fmt.Sprintf(`inline; filename="%s"`, data.Filename))
			w.Write(image)
			return
		}
		data = loadPage()
		data.screenshot = shot
		if r.Header.Get("HX-Request") == "true" {
			render(w, "capture-result", data)
		} else {
			render(w, "page", data)
		}
	}
	mux.HandleFunc("POST /capture", handleCapture)
	mux.HandleFunc("GET /ss", handleCapture)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		if r.URL.Path == "/" || r.URL.Path == "/capture" {
			w.Header().Set("Cache-Control", "no-store")
		}
		mux.ServeHTTP(w, r)
	})
}

func captureVM(ctx context.Context, vm string) ([]byte, error) {
	dir, err := os.MkdirTemp("", "vm-screenshot-*")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(dir)
	path := filepath.Join(dir, "capture.png")
	output, err := exec.CommandContext(ctx, "VBoxManage", "controlvm", vm, "screenshotpng", path).CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("VBoxManage: %w: %s", err, output)
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	const maxSize = 32 << 20
	image, err := io.ReadAll(io.LimitReader(file, maxSize+1))
	if err != nil {
		return nil, err
	}
	if len(image) > maxSize {
		return nil, fmt.Errorf("screenshot exceeds 32 MB")
	}
	return image, nil
}

func render(w http.ResponseWriter, name string, data any) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := views.ExecuteTemplate(w, name, data); err != nil {
		log.Printf("Render %s: %v", name, err)
	}
}

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func portSuffix(addr string) string {
	_, port, err := net.SplitHostPort(addr)
	if err != nil {
		return ":3030"
	}
	return ":" + port
}
