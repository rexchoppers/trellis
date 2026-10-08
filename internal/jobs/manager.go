package jobs

import (
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/rexchoppers/trellis/internal/config"
	"github.com/rexchoppers/trellis/internal/gate"
)

type Manager struct {
	Gate    *gate.Server
	Home    string
	Changed func(root, id string)

	mu        sync.Mutex
	live      map[string]*live
	recovered map[string]bool
	ticking   sync.Once
	done      chan struct{}
}

type live struct {
	root       string
	id         string
	department config.Department
	agent      config.Agent
	names      config.Names
	sess       *session
	token      string
	dir        string

	mu    sync.Mutex
	waits map[int]chan string
	// Refused calls by entry id, so Always can drop the rule that caught them.
	refused map[int]json.RawMessage
	once    map[string]bool
	// Messages sent that the agent has not finished a turn for yet.
	turns     int
	checkedIn bool
	lastText  string
	calls     map[string]call
	reported  bool
	// Set once the agent called fresh_session or rest: this session is on its way out.
	ending bool
}

type call struct {
	name  string
	input json.RawMessage
}

func (m *Manager) changed(root, id string) {
	if m.Changed != nil {
		m.Changed(root, id)
	}
}

var jobMu sync.Mutex

func (m *Manager) update(root, id string, change func(*Job)) (Job, error) {
	jobMu.Lock()
	defer jobMu.Unlock()
	job, err := Load(root, id)
	if err != nil {
		return job, err
	}
	change(&job)
	return job, Save(root, job)
}

func (m *Manager) say(root, id string, entry Entry) Entry {
	entry, _ = Append(root, id, entry)
	m.changed(root, id)
	return entry
}

func (m *Manager) note(root, id, text string) {
	m.say(root, id, Entry{From: "trellis", Kind: "note", Text: text})
}

func findAgent(root, department, agent string) (config.Department, config.Agent, error) {
	departments, err := config.LoadDepartments(root)
	if err != nil {
		return config.Department{}, config.Agent{}, err
	}
	for _, d := range departments {
		if d.Key != department {
			continue
		}
		for _, a := range d.Agents {
			if a.Key == agent {
				return d, a, nil
			}
		}
	}
	return config.Department{}, config.Agent{}, fmt.Errorf("Agent %s/%s not found", department, agent)
}

func newSession() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

func (l *live) send(text string) error {
	l.mu.Lock()
	l.turns++
	l.checkedIn = false
	l.mu.Unlock()
	return l.sess.send(text)
}

func (l *live) release() {
	l.mu.Lock()
	defer l.mu.Unlock()
	for _, wait := range l.waits {
		wait <- "stopped"
	}
	l.waits = map[int]chan string{}
}

func (m *Manager) fail(root, id, reason string) error {
	_, _ = m.update(root, id, func(j *Job) { j.State, j.Reason = Failed, "" })
	m.note(root, id, reason)
	m.tellParent(root, id, "failed: "+reason)
	return errors.New(reason)
}

func (m *Manager) liveJob(id string) *live {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.live[id]
}

func (m *Manager) stop(l *live) {
	m.mu.Lock()
	delete(m.live, l.id)
	m.mu.Unlock()
	l.release()
	l.sess.close()
	select {
	case <-l.sess.done:
	case <-time.After(10 * time.Second):
		l.sess.kill()
	}
	m.Gate.Revoke(l.token)
}

func (m *Manager) exited(l *live, err error) {
	m.mu.Lock()
	if m.live[l.id] == l {
		delete(m.live, l.id)
	}
	m.mu.Unlock()
	l.release()
	m.Gate.Revoke(l.token)
	job, loadErr := m.update(l.root, l.id, func(j *Job) {
		if !j.Over() {
			j.State, j.Reason = NeedsYou, ForStopped
		}
	})
	if loadErr == nil && job.State == NeedsYou {
		text := "The agent stopped. Send a message to pick the job back up."
		if err != nil {
			text = fmt.Sprintf("The agent stopped (%v). Send a message to pick the job back up.", err)
		}
		m.note(l.root, l.id, text)
	}
}

func (m *Manager) Recover(root string) {
	m.mu.Lock()
	if m.recovered == nil {
		m.recovered = map[string]bool{}
	}
	done := m.recovered[root]
	m.recovered[root] = true
	m.mu.Unlock()
	m.ticking.Do(func() { go m.tick() })
	if done {
		return
	}
	list, _ := List(root)
	for _, job := range list {
		// An agent that rests, cut off mid-check, just checks again.
		if !job.NextWake.IsZero() && job.State == Working && m.liveJob(job.ID) == nil {
			_, _ = m.update(root, job.ID, func(j *Job) { j.State, j.Reason, j.Doing, j.NextWake = Waiting, "", "", time.Now() })
			continue
		}
		if (job.State != Working && job.State != NeedsYou) || m.liveJob(job.ID) != nil || job.Reason == ForStopped {
			continue
		}
		thread, _ := Thread(root, job.ID)
		for _, entry := range thread {
			if entry.Kind == "permission" && entry.Decision == "" {
				_ = Decide(root, job.ID, entry.ID, "expired")
			}
		}
		_, _ = m.update(root, job.ID, func(j *Job) { j.State, j.Reason = NeedsYou, ForStopped })
		m.note(root, job.ID, "Trellis restarted. Send a message to pick the job back up.")
	}
}

// Made on first use since a Manager is built as a literal. The caller holds m.mu.
func (m *Manager) closed() chan struct{} {
	if m.done == nil {
		m.done = make(chan struct{})
	}
	return m.done
}

func (m *Manager) Close() {
	m.mu.Lock()
	all := make([]*live, 0, len(m.live))
	for _, l := range m.live {
		all = append(all, l)
	}
	select {
	case <-m.closed():
	default:
		close(m.done)
	}
	m.mu.Unlock()
	for _, l := range all {
		l.sess.kill()
	}
}
