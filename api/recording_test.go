package main

import (
	"strings"
	"testing"
)

func TestRecordingNamesAndNotes(t *testing.T) {
	for _, details := range []recordingDetails{
		{Name: strings.Repeat("x", 121)},
		{Name: "Startup\nApply"},
		{Name: "Contains\x00NUL"},
		{Name: "invalid\xff"},
		{Name: "valid", Notes: strings.Repeat("x", 2001)},
		{Name: "valid", Notes: "bad\x00notes"},
	} {
		if _, err := details.normalized(); err == nil {
			t.Fatalf("invalid metadata accepted: %+v", details)
		}
	}
	details, err := (recordingDetails{Name: "  01 / Startup + unchanged Apply  ", Notes: "  Open app.\nApply once.  "}).normalized()
	if err != nil || details.Name != "01 / Startup + unchanged Apply" || details.Notes != "Open app.\nApply once." {
		t.Fatalf("normalization: %+v %v", details, err)
	}
	for _, name := range []string{"../../unsafe", "USB / HID", "🖱️ नेपाली", strings.Repeat("a", 120), "Name; $(command) `other`"} {
		slug := recordingSlug(name)
		if len(slug) > 48 || strings.ContainsAny(slug, "./\\ $();`") || !validCaptureName("trace-"+slug+"-unique.pcapng") {
			t.Fatalf("unsafe slug %q for %q", slug, name)
		}
	}
	fallback, err := (recordingDetails{}).normalized()
	if err != nil || !strings.HasPrefix(fallback.Name, "Recording ") {
		t.Fatalf("unnamed API compatibility: %+v %v", fallback, err)
	}
}
