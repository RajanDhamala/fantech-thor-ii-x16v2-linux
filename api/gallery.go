package main

import (
	"bytes"
	"fmt"
	"image/png"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type screenshot struct {
	Image      string
	Filename   string
	CapturedAt string
	Dimensions string
	Size       string
	modified   time.Time
}

type screenshotStore struct{ dir string }

func validScreenshotName(name string) bool {
	return name != "" && filepath.Base(name) == name && !strings.ContainsAny(name, `/\`) && strings.HasSuffix(name, ".png")
}

func (s screenshotStore) save(data []byte) (screenshot, error) {
	// Publish only complete files, so concurrent gallery reads never see a partial PNG.
	file, err := os.CreateTemp(s.dir, ".capture-*")
	if err != nil {
		return screenshot{}, err
	}
	defer os.Remove(file.Name())
	if _, err := file.Write(data); err != nil {
		file.Close()
		return screenshot{}, err
	}
	if err := file.Close(); err != nil {
		return screenshot{}, err
	}
	name := fmt.Sprintf("screenshot-%d.png", time.Now().UnixNano())
	if err := os.Rename(file.Name(), filepath.Join(s.dir, name)); err != nil {
		return screenshot{}, err
	}
	info, err := os.Stat(filepath.Join(s.dir, name))
	if err != nil {
		return screenshot{}, err
	}
	return describeScreenshot(name, info, bytes.NewReader(data))
}

func (s screenshotStore) list() ([]screenshot, error) {
	entries, err := os.ReadDir(s.dir)
	if err != nil {
		return nil, err
	}
	var shots []screenshot
	for _, entry := range entries {
		if !validScreenshotName(entry.Name()) || !entry.Type().IsRegular() {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		file, err := os.Open(filepath.Join(s.dir, entry.Name()))
		if err != nil {
			continue
		}
		shot, err := describeScreenshot(entry.Name(), info, io.LimitReader(file, 1<<20))
		file.Close()
		if err == nil {
			shots = append(shots, shot)
		}
	}
	sort.Slice(shots, func(i, j int) bool {
		if shots[i].modified.Equal(shots[j].modified) {
			return shots[i].Filename > shots[j].Filename
		}
		return shots[i].modified.After(shots[j].modified)
	})
	return shots, nil
}

func (s screenshotStore) delete(name string) error {
	if !validScreenshotName(name) {
		return os.ErrNotExist
	}
	path := filepath.Join(s.dir, name)
	info, err := os.Lstat(path)
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() {
		return os.ErrNotExist
	}
	return os.Remove(path)
}

func describeScreenshot(name string, info os.FileInfo, reader io.Reader) (screenshot, error) {
	config, err := png.DecodeConfig(reader)
	if err != nil {
		return screenshot{}, err
	}
	return screenshot{
		Image: "/screenshots/" + url.PathEscape(name), Filename: name,
		CapturedAt: info.ModTime().Format("02 Jan 2006 · 15:04:05 MST"),
		Dimensions: fmt.Sprintf("%d × %d", config.Width, config.Height),
		Size:       fmt.Sprintf("%.0f KB", float64(info.Size())/1024), modified: info.ModTime(),
	}, nil
}
