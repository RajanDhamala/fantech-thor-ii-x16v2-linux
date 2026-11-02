package main

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/url"
	"time"
)

type webControl struct {
	token   string
	send    inputFunc
	network *networkService
}

func (c webControl) register(mux *http.ServeMux) {
	mux.HandleFunc("POST /input", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Content-Type", "application/json")
		fail := func(status int, message string) {
			w.WriteHeader(status)
			json.NewEncoder(w).Encode(map[string]string{"error": message})
		}
		if c.send == nil || c.token == "" {
			fail(http.StatusServiceUnavailable, "VM input is unavailable.")
			return
		}
		if status, message := c.authorize(r); status != 0 {
			fail(status, message)
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, 8192)
		decoder := json.NewDecoder(r.Body)
		decoder.DisallowUnknownFields()
		var action inputAction
		if err := decoder.Decode(&action); err != nil {
			fail(http.StatusBadRequest, "Send one valid JSON input action.")
			return
		}
		if err := decoder.Decode(new(any)); err != io.EOF {
			fail(http.StatusBadRequest, "Send only one JSON input action.")
			return
		}
		if err := validateInput(action); err != nil {
			fail(http.StatusBadRequest, err.Error())
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		defer cancel()
		if err := c.send(ctx, action); err != nil {
			log.Printf("VM input failed: %v", err)
			fail(http.StatusServiceUnavailable, "Input failed. Check that the VM is running and, for mouse actions, the VirtualBox Python SDK and absolute pointing are available. Refresh the screenshot before retrying.")
			return
		}
		json.NewEncoder(w).Encode(map[string]string{"status": "Input sent to the configured VM."})
	})
}

func (c webControl) authorize(r *http.Request) (int, string) {
	if c.token == "" {
		return http.StatusServiceUnavailable, "Controls are unavailable."
	}
	if status, message := checkOrigin(r); status != 0 {
		return status, message
	}
	if subtle.ConstantTimeCompare([]byte(r.Header.Get("X-Control-Token")), []byte(c.token)) != 1 {
		return http.StatusUnauthorized, "Enter the control token printed in the server terminal."
	}
	return 0, ""
}

func checkOrigin(r *http.Request) (int, string) {
	if origin := r.Header.Get("Origin"); origin != "" {
		parsed, err := url.Parse(origin)
		if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host != r.Host {
			return http.StatusForbidden, "This action must come from this page."
		}
	}
	return 0, ""
}
