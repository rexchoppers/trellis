package jobs

import (
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"
)

func (m *Manager) freshSession(root, id, handover string) {
	if l := m.liveJob(id); l != nil {
		m.stop(l)
	}
	job, err := m.update(root, id, func(j *Job) {
		j.Session, j.Started = newSession(), false
		resetProgress(j)
	})
	if err != nil {
		return
	}
	d, agent, err := findAgent(root, job.Department, job.Agent)
	if err != nil {
		_ = m.fail(root, id, err.Error())
		return
	}
	first := job.Task + "\n\n## Handover from your last session\n" + handover
	_ = m.run(root, job, d, agent, first)
}

func (m *Manager) delegate(l *live, ref, task string) (string, error) {
	if task == "" {
		return "", errors.New("A task is required")
	}
	at := slices.IndexFunc(l.agent.Delegates, func(d string) bool {
		d = strings.TrimSpace(d)
		return d == ref || strings.EqualFold(d[strings.LastIndex(d, "/")+1:], ref)
	})
	if at < 0 {
		return "", fmt.Errorf("You can only delegate to: %s", strings.Join(l.agent.Delegates, ", "))
	}
	department, agent, _ := strings.Cut(strings.TrimSpace(l.agent.Delegates[at]), "/")
	_, child, err := findAgent(l.root, department, agent)
	if err != nil {
		return "", err
	}
	id, err := m.start(l.root, department, agent, task, nil, nil, &Link{Job: l.id, Name: l.agent.Name})
	if err != nil {
		return "", err
	}
	_, _ = m.update(l.root, l.id, func(j *Job) { j.Children = append(j.Children, Link{Job: id, Name: child.Name}) })
	m.changed(l.root, l.id)
	return fmt.Sprintf("Started %s's job %s.", child.Name, id), nil
}

func (m *Manager) tellParent(root, id, what string) {
	job, err := Load(root, id)
	if err != nil || job.Parent == nil {
		return
	}
	parent, err := Load(root, job.Parent.Job)
	if err != nil || parent.Over() {
		return
	}
	_, agent, _ := findAgent(root, job.Department, job.Agent)
	name := agent.Name
	if name == "" {
		name = job.Agent
	}
	text := fmt.Sprintf("%s (job %s, %s) %s", name, id, shorten(job.Task, 120), what)
	entry := Entry{From: "child", Kind: "message", By: name, Text: shorten(text, 2000)}
	if parent.State == Waiting && m.liveJob(parent.ID) == nil {
		m.say(root, parent.ID, entry)
		m.wake(root, parent, text)
		return
	}
	_ = m.deliver(root, parent.ID, entry, text)
}

func (m *Manager) rest(root, id, handover string) {
	if l := m.liveJob(id); l != nil {
		m.stop(l)
	}
	job, err := Load(root, id)
	if err != nil {
		return
	}
	_, agent, err := findAgent(root, job.Department, job.Agent)
	if err != nil {
		return
	}
	_, _ = m.update(root, id, func(j *Job) {
		j.State, j.Reason, j.Doing, j.Handover = Waiting, "", "", handover
		j.NextWake = time.Now().Add(agent.Interval())
	})
	m.say(root, id, Entry{From: "agent", Kind: "text", Text: handover})
	m.changed(root, id)
}

func (m *Manager) tick() {
	m.mu.Lock()
	done := m.closed()
	m.mu.Unlock()
	for {
		m.mu.Lock()
		roots := make([]string, 0, len(m.recovered))
		for root := range m.recovered {
			roots = append(roots, root)
		}
		m.mu.Unlock()
		for _, root := range roots {
			list, err := List(root)
			if err != nil {
				continue
			}
			for _, job := range list {
				if job.State == Waiting && !time.Now().Before(job.NextWake) && m.liveJob(job.ID) == nil {
					m.wake(root, job, "")
				}
			}
		}
		select {
		case <-done:
			return
		case <-time.After(30 * time.Second):
		}
	}
}

func (m *Manager) wake(root string, job Job, news string) {
	d, agent, err := findAgent(root, job.Department, job.Agent)
	if err != nil {
		m.note(root, job.ID, "Couldn't wake: "+err.Error())
		return
	}
	job, err = m.update(root, job.ID, func(j *Job) {
		j.Session, j.Started = newSession(), false
		j.NextWake = time.Now().Add(agent.Interval())
		resetProgress(j)
	})
	if err != nil {
		return
	}
	if err := m.run(root, job, d, agent, m.brief(root, job, news)); err != nil {
		// run marks the job failed; a resting agent just tries again at its next check.
		_, _ = m.update(root, job.ID, func(j *Job) { j.State, j.Reason = Waiting, "" })
		m.changed(root, job.ID)
	}
}
