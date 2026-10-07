package main

import (
	"github.com/rexchoppers/trellis/internal/config"
	"github.com/rexchoppers/trellis/internal/jobs"
	"github.com/rexchoppers/trellis/internal/setup"
)

// Departments reads the project's departments and agents from their files.
func (a *App) Departments(path string) ([]config.Department, error) {
	root, err := setup.ProjectRoot(path)
	if err != nil {
		return nil, err
	}
	return config.LoadDepartments(root)
}

// Jobs lists the project's jobs, newest first.
func (a *App) Jobs(path string) ([]jobs.Job, error) {
	return managed(a, path, func(m *jobs.Manager, root string) ([]jobs.Job, error) {
		m.Recover(root)
		return jobs.List(root)
	})
}

// Thread is one job's conversation.
func (a *App) Thread(path, id string) ([]jobs.Entry, error) {
	root, err := setup.ProjectRoot(path)
	if err != nil {
		return nil, err
	}
	return jobs.Thread(root, id)
}

// StartJob gives an agent a task and returns the job's id.
func (a *App) StartJob(path, department, agent, task string) (string, error) {
	return managed(a, path, func(m *jobs.Manager, root string) (string, error) { return m.Start(root, department, agent, task) })
}

// SendMessage passes your message to the job's agent.
func (a *App) SendMessage(path, id, text string) error {
	return a.withManager(path, func(m *jobs.Manager, root string) error { return m.Send(root, id, text) })
}

// Answer decides a permission request (allow, always, deny) or a refusal (once, always).
func (a *App) Answer(path, id string, entry int, decision string) error {
	return a.withManager(path, func(m *jobs.Manager, root string) error { return m.Answer(root, id, entry, decision) })
}

// Finish ends the job with one of its agent's outcomes; empty uses the agent's proposal.
// An outcome that publishes starts every agent listening for its event.
func (a *App) Finish(path, id, outcome string) error {
	return a.withManager(path, func(m *jobs.Manager, root string) error { return m.Finish(root, id, outcome) })
}

// CancelJob stops the job without finishing it.
func (a *App) CancelJob(path, id string) error {
	return a.withManager(path, func(m *jobs.Manager, root string) error { return m.Cancel(root, id) })
}
