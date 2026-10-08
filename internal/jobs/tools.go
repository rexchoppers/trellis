package jobs

import (
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/rexchoppers/trellis/internal/config"
	"github.com/rexchoppers/trellis/internal/gate"
)

func (m *Manager) tool(l *live, name string, args json.RawMessage) (string, error) {
	switch name {
	case gate.Permission:
		return m.onPermission(l, args)
	case gate.Step:
		return m.onStep(l, args)
	case gate.FreshSession, gate.Rest:
		return m.onHandover(l, name, args)
	case gate.Delegate:
		return m.onDelegate(l, args)
	case gate.Message:
		return m.onMessage(l, args)
	case gate.Publish:
		return m.onPublish(l, args)
	case gate.Finish:
		return m.onFinish(l, args)
	case gate.CheckIn:
		return m.onCheckIn(l, args)
	}
	return "", fmt.Errorf("Unknown tool %s", name)
}

// Runs fn after the gate answers the current call, so the session isn't blocked on it when fn stops it.
func afterReply(fn func()) {
	go func() {
		time.Sleep(1500 * time.Millisecond)
		fn()
	}()
}

func (m *Manager) onPermission(l *live, args json.RawMessage) (string, error) {
	var in struct {
		Tool  string          `json:"tool_name"`
		Input json.RawMessage `json:"input"`
	}
	if err := json.Unmarshal(args, &in); err != nil {
		return "", err
	}
	return m.permission(l, in.Tool, in.Input), nil
}

func (m *Manager) onStep(l *live, args json.RawMessage) (string, error) {
	var in struct {
		Name   string `json:"name"`
		Status string `json:"status"`
		Note   string `json:"note"`
	}
	_ = json.Unmarshal(args, &in)
	at := slices.IndexFunc(l.agent.Steps, func(step config.StepDef) bool { return strings.EqualFold(step.Name, strings.TrimSpace(in.Name)) })
	if at < 0 {
		return "", fmt.Errorf("Unknown step %q. Your steps: %s", in.Name, strings.Join(stepNames(l.agent), ", "))
	}
	if in.Status != "active" && in.Status != "done" && in.Status != "skipped" {
		return "", errors.New("status must be active, done or skipped")
	}
	name := l.agent.Steps[at].Name
	_, _ = m.update(l.root, l.id, func(j *Job) {
		if len(j.Progress) != len(l.agent.Steps) {
			j.Progress = newProgress(l.agent)
		}
		for i := range j.Progress {
			if in.Status == "active" && j.Progress[i].Status == "active" {
				j.Progress[i].Status = "done"
			}
		}
		j.Progress[at].Status = in.Status
		if note := strings.TrimSpace(in.Note); note != "" {
			j.Progress[at].Note = shorten(note, 140)
		}
		if in.Status == "active" {
			j.Doing = name
		}
	})
	m.changed(l.root, l.id)
	return "Noted.", nil
}

func (m *Manager) onHandover(l *live, name string, args json.RawMessage) (string, error) {
	var in struct {
		Handover string `json:"handover"`
	}
	_ = json.Unmarshal(args, &in)
	handover := strings.TrimSpace(in.Handover)
	if handover == "" {
		return "", errors.New("A handover is required")
	}
	l.mu.Lock()
	l.checkedIn, l.ending = true, true
	l.mu.Unlock()
	if name == gate.Rest {
		afterReply(func() { m.rest(l.root, l.id, handover) })
		return "Resting until the next check. End your turn now.", nil
	}
	m.say(l.root, l.id, Entry{From: "agent", Kind: "session", Text: handover})
	afterReply(func() { m.freshSession(l.root, l.id, handover) })
	return "Starting a fresh session. End your turn now.", nil
}

func (m *Manager) onDelegate(l *live, args json.RawMessage) (string, error) {
	var in struct {
		Agent string `json:"agent"`
		Task  string `json:"task"`
	}
	_ = json.Unmarshal(args, &in)
	return m.delegate(l, strings.TrimSpace(in.Agent), strings.TrimSpace(in.Task))
}

func (m *Manager) onMessage(l *live, args json.RawMessage) (string, error) {
	var in struct {
		Job  string `json:"job"`
		Text string `json:"text"`
	}
	_ = json.Unmarshal(args, &in)
	job, err := Load(l.root, l.id)
	if err != nil {
		return "", err
	}
	at := slices.IndexFunc(job.Children, func(c Link) bool { return c.Job == strings.TrimSpace(in.Job) })
	if at < 0 {
		return "", errors.New("That is not one of your jobs")
	}
	text := strings.TrimSpace(in.Text)
	entry := Entry{From: "parent", Kind: "message", By: l.agent.Name, Text: text}
	if err := m.deliver(l.root, job.Children[at].Job, entry, fmt.Sprintf("%s, who started this job, says: %s", l.agent.Name, text)); err != nil {
		return "", err
	}
	return "Sent.", nil
}

func (m *Manager) onPublish(l *live, args json.RawMessage) (string, error) {
	var in struct {
		Outcome string            `json:"outcome"`
		Data    map[string]string `json:"data"`
	}
	_ = json.Unmarshal(args, &in)
	outcome, ok := l.agent.OutcomeNamed(strings.TrimSpace(in.Outcome))
	if !ok || outcome.Publish == "" {
		return "", fmt.Errorf("%q does not send an event. Use one of: %s", in.Outcome, outcomeNames(l.agent, true))
	}
	if missing := outcome.Missing(in.Data); len(missing) > 0 {
		return "", fmt.Errorf("Missing data: %s", strings.Join(missing, ", "))
	}
	job, err := Load(l.root, l.id)
	if err != nil {
		return "", err
	}
	if err := m.publish(l.root, job, l.department, l.agent, outcome, in.Data); err != nil {
		return "", err
	}
	thread, _ := Thread(l.root, l.id)
	sent := "Sent."
	if len(thread) > 0 && thread[len(thread)-1].Kind == "sent" {
		sent = thread[len(thread)-1].Text
	}
	return sent + " Carry on with your job.", nil
}

func (m *Manager) onFinish(l *live, args json.RawMessage) (string, error) {
	var in struct {
		Summary string            `json:"summary"`
		Outcome string            `json:"outcome"`
		Data    map[string]string `json:"data"`
	}
	_ = json.Unmarshal(args, &in)
	outcome, ok := l.agent.OutcomeNamed(strings.TrimSpace(in.Outcome))
	if !ok {
		return "", fmt.Errorf("Unknown outcome %q. Use one of: %s", in.Outcome, outcomeNames(l.agent, false))
	}
	summary := strings.TrimSpace(in.Summary)
	if summary == "" {
		return "", errors.New("A summary is required")
	}
	if missing := outcome.Missing(in.Data); len(missing) > 0 {
		return "", fmt.Errorf("Missing data: %s", strings.Join(missing, ", "))
	}
	if open := unfinishedSteps(l.root, l.id); len(open) > 0 {
		return "", fmt.Errorf("Steps not reported yet: %s. Report each as done or skipped with the step tool, then finish", strings.Join(open, ", "))
	}
	// Finishing completes the step it is on.
	_, _ = m.update(l.root, l.id, func(j *Job) {
		for i := range j.Progress {
			if j.Progress[i].Status == "active" {
				j.Progress[i].Status = "done"
			}
		}
	})
	l.mu.Lock()
	l.checkedIn = true
	l.mu.Unlock()
	_, _ = m.update(l.root, l.id, func(j *Job) { j.Outcome, j.Data = outcome.Name, in.Data })
	m.say(l.root, l.id, Entry{From: "agent", Kind: "check_in", Text: summary, Outcome: outcome.Name, Data: in.Data})
	if outcome.Confirm {
		_, _ = m.update(l.root, l.id, func(j *Job) { j.State, j.Reason = NeedsYou, ForCheckIn })
		m.changed(l.root, l.id)
		return "Proposed. This outcome needs the human: end your turn now; they will finish the job or reply.", nil
	}
	afterReply(func() {
		if err := m.finish(l.root, l.id, outcome.Name, l.agent.Name); err != nil {
			m.note(l.root, l.id, "Couldn't finish the job: "+err.Error())
		}
	})
	return "Finished. End your turn now.", nil
}

func (m *Manager) onCheckIn(l *live, args json.RawMessage) (string, error) {
	l.mu.Lock()
	ending := l.ending
	l.mu.Unlock()
	if ending {
		return "This session is ending. End your turn now.", nil
	}
	var in struct {
		Summary string            `json:"summary"`
		Outcome string            `json:"outcome"`
		Data    map[string]string `json:"data"`
	}
	_ = json.Unmarshal(args, &in)
	summary := strings.TrimSpace(in.Summary)
	if summary == "" {
		return "", errors.New("A summary is required")
	}
	outcome := strings.TrimSpace(in.Outcome)
	if outcome != "" {
		if _, ok := l.agent.OutcomeNamed(outcome); !ok {
			return "", fmt.Errorf("Unknown outcome %q. Use one of: %s", outcome, outcomeNames(l.agent, false))
		}
		_, _ = m.update(l.root, l.id, func(j *Job) { j.Outcome, j.Data = outcome, in.Data })
	}
	l.mu.Lock()
	l.checkedIn = true
	last := l.turns <= 1
	l.mu.Unlock()
	m.say(l.root, l.id, Entry{From: "agent", Kind: "check_in", Text: summary, Outcome: outcome, Data: in.Data})
	m.tellParent(l.root, l.id, "checked in: "+summary)
	if last {
		_, _ = m.update(l.root, l.id, func(j *Job) { j.State, j.Reason = NeedsYou, ForCheckIn })
		m.changed(l.root, l.id)
	}
	return "The human has your summary. End your turn now; they will reply with feedback, mark the job done, or cancel it.", nil
}

func outcomeNames(agent config.Agent, events bool) string {
	var names []string
	for _, o := range agent.Outcomes {
		if !events || o.Publish != "" {
			names = append(names, o.Name)
		}
	}
	return strings.Join(names, ", ")
}

func stepNames(agent config.Agent) []string {
	names := make([]string, len(agent.Steps))
	for i, step := range agent.Steps {
		names[i] = step.Name
	}
	return names
}

func newProgress(agent config.Agent) []Step {
	var progress []Step
	for _, step := range agent.Steps {
		progress = append(progress, Step{Name: step.Name, Status: "pending"})
	}
	return progress
}

func resetProgress(j *Job) {
	for i := range j.Progress {
		j.Progress[i].Status, j.Progress[i].Note = "pending", ""
	}
}

func activeStep(root, id string) string {
	job, err := Load(root, id)
	if err != nil {
		return ""
	}
	for _, step := range job.Progress {
		if step.Status == "active" {
			return step.Name
		}
	}
	return ""
}

// Leaves out the active step, since finishing completes it.
func unfinishedSteps(root, id string) []string {
	job, err := Load(root, id)
	if err != nil {
		return nil
	}
	var open []string
	for _, step := range job.Progress {
		if step.Status == "pending" {
			open = append(open, step.Name)
		}
	}
	return open
}
