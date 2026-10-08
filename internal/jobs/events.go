package jobs

import (
	"os"
	"path/filepath"
	"time"
)

type Event struct {
	ID      string            `json:"id"`
	Name    string            `json:"name"`
	At      time.Time         `json:"at"`
	From    Origin            `json:"from"`
	Data    map[string]string `json:"data"`
	Started []string          `json:"started"`
}

func recordEvent(root string, event Event) error {
	if err := os.MkdirAll(folder(root), 0o755); err != nil {
		return err
	}
	fileMu.Lock()
	defer fileMu.Unlock()
	return appendJSON(filepath.Join(folder(root), "events.jsonl"), event)
}
