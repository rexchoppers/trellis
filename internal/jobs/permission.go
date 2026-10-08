package jobs

import (
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"

	"github.com/rexchoppers/trellis/internal/config"
)

func allow(input json.RawMessage) string {
	if len(input) == 0 {
		input = json.RawMessage("{}")
	}
	// Unescaped, so a file of HTML is not doubled in tokens by < and friends.
	var b strings.Builder
	enc := json.NewEncoder(&b)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(map[string]any{"behavior": "allow", "updatedInput": input})
	return strings.TrimSpace(b.String())
}

func deny(message string) string {
	raw, _ := json.Marshal(map[string]any{"behavior": "deny", "message": message})
	return string(raw)
}

func (m *Manager) permission(l *live, tool string, input json.RawMessage) string {
	l.mu.Lock()
	once := l.once[tool]
	delete(l.once, tool)
	agent := l.agent
	l.mu.Unlock()
	if once {
		return allow(input)
	}
	// A tool a step owns only runs while that step is active.
	if owners := agent.StepFor(tool, input, l.names); len(owners) > 0 {
		current := activeStep(l.root, l.id)
		if !slices.Contains(owners, current) {
			now := "no step is active"
			if current != "" {
				now = "you are on " + current
			}
			return deny(fmt.Sprintf("%s only works in the %s step, and %s. Call step with name %q and status active first, once that step really is where you are.", toolName(tool), strings.Join(owners, " or "), now, owners[0]))
		}
	}
	kind := "permission"
	switch agent.Classify(tool, input, l.names) {
	case config.Free:
		return allow(input)
	case config.Never:
		// Not on the agent's list: the agent still waits for the human, so nothing it says next lands under an open question.
		kind = "refused"
	}
	entry := m.say(l.root, l.id, Entry{From: "trellis", Kind: kind, Tool: toolName(tool), Input: subject(l.dir, input), Text: tool})
	wait := make(chan string, 1)
	l.mu.Lock()
	l.waits[entry.ID] = wait
	l.mu.Unlock()
	_, _ = m.update(l.root, l.id, func(j *Job) { j.State, j.Reason = NeedsYou, ForPermission })
	m.changed(l.root, l.id)

	decision := <-wait

	l.mu.Lock()
	delete(l.waits, entry.ID)
	l.mu.Unlock()
	_, _ = m.update(l.root, l.id, func(j *Job) {
		if j.State == NeedsYou && j.Reason == ForPermission {
			j.State, j.Reason = Working, ""
		}
	})
	m.changed(l.root, l.id)
	switch decision {
	case "allow", "once":
		return allow(input)
	case "always":
		m.always(l.root, l.id, l, tool, input)
		return allow(input)
	case "stopped":
		return deny("The session is ending.")
	}
	if kind == "refused" {
		return deny("Not on this agent's list of allowed tools, and the human said no. Tell them in check_in what you need and why.")
	}
	return deny("The human said no. Ask them in check_in if you need another way.")
}

func (m *Manager) always(root, id string, l *live, tool string, input json.RawMessage) {
	var department, key string
	var names config.Names
	if l != nil {
		department, key, names = l.department.Key, l.agent.Key, l.names
	} else {
		job, err := Load(root, id)
		if err != nil {
			return
		}
		project, _, _ := config.LoadProject(root)
		department, key, names = job.Department, job.Agent, config.NamesOf(project)
	}
	// From the file as it is now, not as the session loaded it: it may have been edited since.
	_, agent, err := findAgent(root, department, key)
	if err != nil {
		if l == nil {
			return
		}
		agent = l.agent
	}
	agent = agent.Allow(tool, input, names)
	if l != nil {
		l.mu.Lock()
		l.agent.Permissions = agent.Permissions
		l.mu.Unlock()
	}
	if err := config.SaveAgent(root, department, agent); err != nil {
		m.note(root, id, "Couldn't save the permission to the agent's file: "+err.Error())
	}
}

// decision is allow, always or deny for a request; once or always for a refusal.
func (m *Manager) Answer(root, id string, entryID int, decision string) error {
	thread, err := Thread(root, id)
	if err != nil {
		return err
	}
	var entry *Entry
	for i := range thread {
		if thread[i].ID == entryID {
			entry = &thread[i]
		}
	}
	if entry == nil || entry.Decision != "" {
		return errors.New("Already answered")
	}
	l := m.liveJob(id)
	if entry.Kind == "refused" && l != nil {
		l.mu.Lock()
		waiting := l.waits[entryID] != nil
		l.mu.Unlock()
		if waiting {
			entry.Kind = "permission"
		}
	}
	switch entry.Kind {
	case "permission":
		if l == nil {
			return errors.New("The agent stopped before you answered. Send a message to pick the job back up.")
		}
		l.mu.Lock()
		wait := l.waits[entryID]
		l.mu.Unlock()
		if wait == nil {
			return errors.New("This request has expired")
		}
		if err := Decide(root, id, entryID, decision); err != nil {
			return err
		}
		wait <- decision
		m.changed(root, id)
		return nil
	case "refused":
		// Refused before the agent waited on refusals: it has moved on, so allowing tells it to try again.
		if err := Decide(root, id, entryID, decision); err != nil {
			return err
		}
		if decision == "deny" {
			m.changed(root, id)
			return nil
		}
		tool := entry.Text
		if l != nil && decision != "always" {
			l.mu.Lock()
			l.once[tool] = true
			l.mu.Unlock()
		}
		message := fmt.Sprintf("The human allowed %s this once. You can try again.", toolName(tool))
		if decision == "always" {
			m.always(root, id, l, tool, nil)
			message = fmt.Sprintf("The human allowed %s from now on. You can try again.", toolName(tool))
		}
		m.changed(root, id)
		return m.Send(root, id, message)
	}
	return errors.New("Nothing to answer")
}
