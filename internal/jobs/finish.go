package jobs

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/rexchoppers/trellis/internal/config"
)

func (m *Manager) Finish(root, id, outcome string) error {
	return m.finish(root, id, outcome, "")
}

// by is the finishing agent's name, or empty when the human finished the job.
func (m *Manager) finish(root, id, outcome, by string) error {
	job, err := Load(root, id)
	if err != nil {
		return err
	}
	if job.State == Done || job.State == Cancelled {
		return nil
	}
	d, agent, err := findAgent(root, job.Department, job.Agent)
	if err != nil {
		return err
	}
	if outcome == "" {
		outcome = job.Outcome
	}
	var chosen config.Outcome
	if len(agent.Outcomes) > 0 {
		var ok bool
		if chosen, ok = agent.OutcomeNamed(outcome); !ok {
			return errors.New("Choose how this job ended")
		}
	}
	if job.Branch != "" {
		title := job.Task
		if title == "" {
			title = "Trellis job " + job.ID
		}
		url, err := openPR(job.Worktree, job.Branch, job.Base, shorten(title, 72), lastCheckIn(root, id)+"\n\nOpened by Trellis.")
		if err != nil {
			m.note(root, id, "Couldn't open the PR: "+err.Error())
			return err
		}
		if url == "" {
			m.note(root, id, "No changes on the branch, so no PR.")
		} else {
			job.PR = url
			m.note(root, id, "Opened "+url)
		}
	}
	if by != "" {
		m.say(root, id, Entry{From: "agent", Kind: "done", Text: chosen.Label, Outcome: chosen.Name})
	} else {
		m.say(root, id, Entry{From: "you", Kind: "done", Text: chosen.Label, Outcome: chosen.Name})
	}
	if l := m.liveJob(id); l != nil {
		// Wait so the worktree can be checked for uncommitted work once the session is gone.
		if job.Worktree != "" {
			m.stop(l)
		} else {
			go m.stop(l)
		}
	}
	m.dropWorktree(root, job)
	_, err = m.update(root, id, func(j *Job) {
		j.State, j.Reason, j.Outcome = Done, "", chosen.Name
		if job.PR != "" {
			j.PR = job.PR
			j.Produced = append(j.Produced, Produced{Kind: "pr", Label: "PR", URL: job.PR})
		}
	})
	m.changed(root, id)
	if err != nil {
		return err
	}
	if chosen.Name != "" {
		m.tellParent(root, id, "finished: "+chosen.Label+"."+dataLines(job.Data))
	} else {
		m.tellParent(root, id, "was marked done.")
	}
	if chosen.Back {
		go m.sendBack(root, job, agent, chosen, job.Data)
	}
	if chosen.Publish == "" {
		return nil
	}
	// Starting whoever listens can take a while (worktrees, sessions); the job is already done.
	go func() {
		if err := m.publish(root, job, d, agent, chosen, job.Data); err != nil {
			m.note(root, id, "Couldn't hand it on: "+err.Error())
		}
	}()
	return nil
}

func (m *Manager) sendBack(root string, job Job, agent config.Agent, outcome config.Outcome, data map[string]string) {
	if job.From == nil || job.From.Job == "" {
		m.note(root, job.ID, "Nothing to send it back to: no agent handed this job over.")
		return
	}
	origin, err := Load(root, job.From.Job)
	if err != nil {
		m.note(root, job.ID, "Couldn't send it back: "+err.Error())
		return
	}
	d, back, err := findAgent(root, origin.Department, origin.Agent)
	if err != nil {
		m.note(root, job.ID, "Couldn't send it back: "+err.Error())
		return
	}
	text := sentBack(agent.Name, outcome, data)
	if origin.State == Working || origin.State == NeedsYou {
		if err := m.Send(root, origin.ID, text); err != nil {
			m.note(root, job.ID, "Couldn't send it back: "+err.Error())
		}
		return
	}
	count, err := busy(root, origin.Department, origin.Agent)
	if err != nil {
		m.note(root, job.ID, "Couldn't send it back: "+err.Error())
		return
	}
	if back.Desks.Full(count) {
		m.note(root, job.ID, fmt.Sprintf("Couldn't send it back: %s has no free desk. Send %s a message once one is free.", back.Name, back.Name))
		return
	}
	dir := origin.Worktree
	if back.Worktree {
		if dir, err = reopenWorktree(root, origin, back.Branches == "own"); err != nil {
			m.note(root, job.ID, "Couldn't send it back: "+err.Error())
			return
		}
	}
	reopened, err := m.update(root, origin.ID, func(j *Job) {
		j.State, j.Reason, j.Outcome, j.Data, j.Doing, j.Worktree = Working, "", "", nil, "Thinking", dir
		resetProgress(j)
	})
	if err != nil {
		m.note(root, job.ID, "Couldn't send it back: "+err.Error())
		return
	}
	m.say(root, origin.ID, Entry{From: "trellis", Kind: "event", Text: agent.Name, Outcome: outcome.Name, Data: data})
	m.note(root, job.ID, fmt.Sprintf("Sent back to %s, in their original job.", back.Name))
	m.changed(root, origin.ID)
	if err := m.run(root, reopened, d, back, text); err != nil {
		m.note(root, job.ID, "Couldn't restart "+back.Name+": "+err.Error())
	}
}

func (m *Manager) publish(root string, job Job, d config.Department, agent config.Agent, outcome config.Outcome, given map[string]string) error {
	data := map[string]string{}
	for key, value := range given {
		data[key] = value
	}
	for key, value := range outcome.With {
		data[key] = value
	}
	from := Origin{Event: outcome.Publish, Job: job.ID, Agent: agent.Name, Department: d.Name}
	event := Event{ID: NewID(), Name: outcome.Publish, At: time.Now().UTC(), From: from, Data: data}

	departments, err := config.LoadDepartments(root)
	if err != nil {
		return err
	}
	var sent, missed []string
	for _, listener := range config.Listeners(departments, event.Name, data) {
		started, err := m.start(root, listener.Department.Key, listener.Agent.Key, handoff(event), &from, data, nil)
		if err != nil {
			missed = append(missed, fmt.Sprintf("%s (%v)", listener.Agent.Name, err))
			continue
		}
		event.Started = append(event.Started, started)
		sent = append(sent, listener.Agent.Name)
	}
	if err := recordEvent(root, event); err != nil {
		return err
	}
	text := fmt.Sprintf("Sent %s; nobody is listening for it.", event.Name)
	if len(sent) > 0 {
		text = fmt.Sprintf("Sent %s to %s.", event.Name, strings.Join(sent, ", "))
	}
	if len(missed) > 0 {
		text += " Not started: " + strings.Join(missed, "; ") + "."
	}
	m.say(root, job.ID, Entry{From: "trellis", Kind: "sent", Text: text, Outcome: event.Name, Data: data})
	return nil
}

func (m *Manager) Cancel(root, id string) error {
	job, err := Load(root, id)
	if err != nil {
		return err
	}
	if job.State == Done || job.State == Cancelled {
		return nil
	}
	if l := m.liveJob(id); l != nil {
		m.stop(l)
	}
	m.dropWorktree(root, job)
	m.say(root, id, Entry{From: "you", Kind: "cancelled"})
	_, err = m.update(root, id, func(j *Job) { j.State, j.Reason = Cancelled, "" })
	m.changed(root, id)
	m.tellParent(root, id, "was cancelled.")
	return err
}

// A worktree whose agent owns its branches is kept while dirty: nothing else holds that work.
func (m *Manager) dropWorktree(root string, job Job) {
	if job.Worktree == "" {
		return
	}
	if job.Branch == "" && dirty(job.Worktree) {
		m.note(root, job.ID, "Kept the worktree at "+job.Worktree+": it has uncommitted changes.")
		return
	}
	removeWorktree(root, job.Worktree)
}

func lastCheckIn(root, id string) string {
	thread, _ := Thread(root, id)
	for i := len(thread) - 1; i >= 0; i-- {
		if thread[i].Kind == "check_in" {
			return thread[i].Text
		}
	}
	return ""
}
