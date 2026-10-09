package jobs

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"gopkg.in/yaml.v3"
)

const (
	Working   = "working"
	NeedsYou  = "needs_you"
	Done      = "done"
	Failed    = "failed"
	Cancelled = "cancelled"
	// Resting between checks: no session runs until it next wakes.
	Waiting = "waiting"

	ForPermission = "permission"
	ForCheckIn    = "check_in"
	ForStopped    = "stopped"
)

type Job struct {
	ID         string `yaml:"id" json:"id"`
	Department string `yaml:"department" json:"department"`
	Agent      string `yaml:"agent" json:"agent"`
	Task       string `yaml:"task" json:"task"`
	State      string `yaml:"state" json:"state"`
	Reason     string `yaml:"reason,omitempty" json:"reason"`
	Session    string `yaml:"session" json:"session"`
	// Set once the session has run, so the next start resumes it.
	Started  bool              `yaml:"started,omitempty" json:"-"`
	Branch   string            `yaml:"branch,omitempty" json:"branch"`
	Worktree string            `yaml:"worktree,omitempty" json:"-"`
	Base     string            `yaml:"base,omitempty" json:"-"`
	PR       string            `yaml:"pr,omitempty" json:"pr"`
	Outcome  string            `yaml:"outcome,omitempty" json:"outcome"`
	Data     map[string]string `yaml:"data,omitempty" json:"data"`
	From     *Origin           `yaml:"from,omitempty" json:"from"`
	Progress []Step            `yaml:"progress,omitempty" json:"progress"`
	Doing    string            `yaml:"doing,omitempty" json:"doing"`
	Produced []Produced        `yaml:"produced,omitempty" json:"produced"`
	// When review comments on the job's PR were last sent to it.
	Reviewed time.Time `yaml:"reviewed,omitempty" json:"-"`
	Created  time.Time `yaml:"created" json:"created"`
	NextWake time.Time `yaml:"next_wake,omitempty" json:"nextWake"`
	Handover string    `yaml:"handover,omitempty" json:"-"`
	Parent   *Link     `yaml:"parent,omitempty" json:"parent"`
	Children []Link    `yaml:"children,omitempty" json:"children"`
}

func (j Job) Over() bool { return j.State == Done || j.State == Failed || j.State == Cancelled }

type Link struct {
	Job  string `yaml:"job" json:"job"`
	Name string `yaml:"name" json:"name"`
}

type Step struct {
	Name   string `yaml:"name" json:"name"`
	Status string `yaml:"status" json:"status"`
	Note   string `yaml:"note,omitempty" json:"note"`
}

type Origin struct {
	Event      string `yaml:"event" json:"event"`
	Job        string `yaml:"job" json:"job"`
	Agent      string `yaml:"agent" json:"agent"`
	Department string `yaml:"department" json:"department"`
}

type Produced struct {
	Kind  string `yaml:"kind" json:"kind"`
	Label string `yaml:"label" json:"label"`
	URL   string `yaml:"url,omitempty" json:"url"`
}

type Entry struct {
	ID   int       `json:"id"`
	At   time.Time `json:"at"`
	From string    `json:"from"` // you, agent, trellis, parent, child
	// task, message, done, cancelled (you); text, thinking, step, check_in, session (agent); permission, refused, note, event, sent (trellis); message (parent, child)
	Kind     string            `json:"kind"`
	By       string            `json:"by,omitempty"`
	Text     string            `json:"text,omitempty"`
	Tool     string            `json:"tool,omitempty"`
	Input    string            `json:"input,omitempty"`
	Decision string            `json:"decision,omitempty"`
	Outcome  string            `json:"outcome,omitempty"`
	Data     map[string]string `json:"data,omitempty"`
}

var fileMu sync.Mutex

func folder(root string) string      { return filepath.Join(root, ".trellis", "jobs") }
func Dir(root, id string) string     { return filepath.Join(folder(root), id) }
func jobPath(root, id string) string { return filepath.Join(Dir(root, id), "job.yaml") }
func threadPath(root, id string) string {
	return filepath.Join(Dir(root, id), "thread.jsonl")
}

func Save(root string, job Job) error {
	if job.ID == "" || strings.ContainsAny(job.ID, `/\`) {
		return fmt.Errorf("invalid job id %q", job.ID)
	}
	if err := os.MkdirAll(Dir(root, job.ID), 0o755); err != nil {
		return err
	}
	raw, err := yaml.Marshal(job)
	if err != nil {
		return err
	}
	tmp := jobPath(root, job.ID) + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, jobPath(root, job.ID))
}

func Load(root, id string) (Job, error) {
	var job Job
	raw, err := os.ReadFile(jobPath(root, id))
	if err != nil {
		return job, err
	}
	return job, yaml.Unmarshal(raw, &job)
}

func List(root string) ([]Job, error) {
	entries, err := os.ReadDir(folder(root))
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return nil, err
	}
	list := []Job{}
	for _, entry := range entries {
		if !entry.IsDir() || strings.HasPrefix(entry.Name(), ".") {
			continue
		}
		job, err := Load(root, entry.Name())
		if err != nil {
			continue
		}
		list = append(list, job)
	}
	sort.SliceStable(list, func(i, j int) bool { return list[i].Created.After(list[j].Created) })
	return list, nil
}

func Thread(root, id string) ([]Entry, error) {
	fileMu.Lock()
	defer fileMu.Unlock()
	return readThread(root, id)
}

func readThread(root, id string) ([]Entry, error) {
	raw, err := os.ReadFile(threadPath(root, id))
	if errors.Is(err, fs.ErrNotExist) {
		return []Entry{}, nil
	}
	if err != nil {
		return nil, err
	}
	thread := []Entry{}
	scanner := bufio.NewScanner(bytes.NewReader(raw))
	scanner.Buffer(make([]byte, 1024*1024), 16*1024*1024)
	for scanner.Scan() {
		var entry Entry
		if json.Unmarshal(scanner.Bytes(), &entry) == nil {
			thread = append(thread, entry)
		}
	}
	return thread, nil
}

func Append(root, id string, entry Entry) (Entry, error) {
	fileMu.Lock()
	defer fileMu.Unlock()
	thread, err := readThread(root, id)
	if err != nil {
		return entry, err
	}
	entry.ID = len(thread) + 1
	if entry.At.IsZero() {
		entry.At = time.Now().UTC()
	}
	return entry, appendJSON(threadPath(root, id), entry)
}

// The caller holds fileMu.
func appendJSON(path string, value any) error {
	raw, err := json.Marshal(value)
	if err != nil {
		return err
	}
	file, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	defer file.Close()
	_, err = file.Write(append(raw, '\n'))
	return err
}

func Decide(root, id string, entryID int, decision string) error {
	fileMu.Lock()
	defer fileMu.Unlock()
	thread, err := readThread(root, id)
	if err != nil {
		return err
	}
	var out bytes.Buffer
	for _, entry := range thread {
		if entry.ID == entryID {
			entry.Decision = decision
		}
		raw, _ := json.Marshal(entry)
		out.Write(append(raw, '\n'))
	}
	return os.WriteFile(threadPath(root, id), out.Bytes(), 0o644)
}

var (
	idMu   sync.Mutex
	lastID string
)

func NewID() string {
	idMu.Lock()
	defer idMu.Unlock()
	base := "J-" + time.Now().UTC().Format("20060102-150405")
	for n := 1; ; n++ {
		id := fmt.Sprintf("%s-%03d", base, n)
		if id > lastID {
			lastID = id
			return id
		}
	}
}

func ensureIgnored(root string) error {
	path := filepath.Join(root, ".trellis", ".gitignore")
	raw, err := os.ReadFile(path)
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	have := map[string]bool{}
	for _, line := range strings.Split(string(raw), "\n") {
		have[strings.TrimSpace(line)] = true
	}
	if len(raw) > 0 && !bytes.HasSuffix(raw, []byte("\n")) {
		raw = append(raw, '\n')
	}
	for _, want := range []string{"jobs/", "worktrees/"} {
		if !have[want] {
			raw = append(raw, []byte(want+"\n")...)
		}
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, raw, 0o644)
}
