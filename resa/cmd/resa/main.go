// resa provides cached discovery and an explicitly experimental lighting path.
package main

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"resa/internal/device"
	"runtime"
	"time"

	"resa/internal/discovery"
	"resa/internal/hidraw"
	"resa/internal/lighting"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "resa:", err)
		os.Exit(1)
	}
}

func run() error {
	if runtime.GOOS != "linux" {
		return fmt.Errorf("discovery requires Linux sysfs")
	}
	if len(os.Args) == 3 && os.Args[1] == "device" {
		input, err := io.ReadAll(io.LimitReader(os.Stdin, 8193))
		if err != nil {
			return err
		}
		ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
		defer cancel()
		output, err := device.Run(ctx, os.Args[2], input)
		if err != nil {
			return err
		}
		_, err = os.Stdout.Write(output)
		return err
	}
	if len(os.Args) >= 2 && os.Args[1] == "lighting" {
		return runLighting(os.Args[2:])
	}
	if len(os.Args) < 2 || os.Args[1] != "list" {
		return fmt.Errorf("usage: resa device read|apply|restore|rgb (JSON on stdin) | list [--all] [--json] | lighting [--brightness 0..7] [--speed 0..7] [--json] [--apply --experimental]")
	}
	fs := flag.NewFlagSet("list", flag.ContinueOnError)
	all := fs.Bool("all", false, "include devices other than USB 30fa:1440")
	asJSON := fs.Bool("json", false, "emit JSON, including cached report descriptor bytes")
	if err := fs.Parse(os.Args[2:]); err != nil {
		return err
	}
	if fs.NArg() != 0 {
		return fmt.Errorf("unexpected arguments: %v", fs.Args())
	}
	devices, err := discovery.Scan("/sys/class/hidraw", *all)
	if err != nil {
		return err
	}
	if *asJSON {
		e := json.NewEncoder(os.Stdout)
		e.SetIndent("", "  ")
		return e.Encode(devices)
	}
	if len(devices) == 0 {
		fmt.Println("No matching HID interfaces found.")
		return nil
	}
	for _, d := range devices {
		fmt.Printf("%s  bus=%04x %04x:%04x  %s\n", d.Node, d.Bus, d.VID, d.PID, d.Name)
		fmt.Printf("  manufacturer=%q product=%q interface=%s usb=%s\n", d.Manufacturer, d.Product, d.Interface, d.USBPath)
		for _, r := range d.Reports {
			fmt.Printf("  %s report=0x%02x payload=%d bits (%d bytes) ID-inclusive=%d bytes\n", r.Kind, r.ID, r.Bits, (r.Bits+7)/8, r.BytesWithID)
		}
		for _, w := range d.Warnings {
			fmt.Println("  warning:", w)
		}
		if d.DescriptorHex != "" {
			b, _ := hex.DecodeString(d.DescriptorHex)
			fmt.Printf("  cached descriptor: %d bytes; SHA-256 %s\n", len(b), d.DescriptorSHA256)
		}
	}
	return nil
}

func runLighting(args []string) error {
	fs := flag.NewFlagSet("lighting", flag.ContinueOnError)
	brightness := fs.Int("brightness", 4, "raw experimental brightness level, 0..7")
	speed := fs.Int("speed", 3, "raw experimental timing level, 0..7; units unverified")
	apply := fs.Bool("apply", false, "send one experimental lighting feature report")
	experimental := fs.Bool("experimental", false, "acknowledge unverified hardware effects and persistence")
	asJSON := fs.Bool("json", false, "emit the plan or transfer result as JSON")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if fs.NArg() != 0 {
		return fmt.Errorf("unexpected arguments: %v", fs.Args())
	}
	settings := lighting.Settings{Brightness: *brightness, Speed: *speed}
	result, err := lighting.Plan(settings)
	if err != nil {
		return err
	}
	if *apply {
		if !*experimental {
			return fmt.Errorf("sending requires both --apply and --experimental; omit --apply to preview the report")
		}
		devices, scanErr := discovery.Scan("/sys/class/hidraw", false)
		if scanErr != nil {
			return scanErr
		}
		result, err = lighting.Apply(settings, devices, hidraw.Open)
		if err != nil {
			return err
		}
	}
	if *asJSON {
		return json.NewEncoder(os.Stdout).Encode(result)
	}
	fmt.Printf("%s: %s\n%s\n", result.Status, result.ReportHex, result.Note)
	return nil
}
