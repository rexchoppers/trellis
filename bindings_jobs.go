package main

import (
	"github.com/rexchoppers/trellis/internal/config"
	"github.com/rexchoppers/trellis/internal/jobs"
	"github.com/rexchoppers/trellis/internal/setup"
)

func (a *App) Departments(path string) ([]config.Department, error) {
	root, err := setup.ProjectRoot(path)
	if err != nil {
		return nil, err
	}
	return config.LoadDepartments(root)
}

func (a *App) Jobs(path string) ([]jobs.Job, error) {
	return managed(a, path, func(m *jobs.Manager, root string) ([]jobs.Job, error) {
		m.Recover(root)
		return jobs.List(root)
	})
}

func (a *App) Thread(path, id string) ([]jobs.Entry, error) {
	root, err := setup.ProjectRoot(path)
	if err != nil {
		return nil, err
	}
	return jobs.Thread(root, id)
}

func (a *App) StartJob(path, department, agent, task string) (string, error) {
	return managed(a, path, func(m *jobs.Manager, root string) (string, error) { return m.Start(root, department, agent, task) })
}

func (a *App) SendMessage(path, id, text string) error {
	return a.withManager(path, func(m *jobs.Manager, root string) error { return m.Send(root, id, text) })
}

func (a *App) Answer(path, id string, entry int, decision string) error {
	return a.withManager(path, func(m *jobs.Manager, root string) error { return m.Answer(root, id, entry, decision) })
}

func (a *App) Finish(path, id, outcome string) error {
	return a.withManager(path, func(m *jobs.Manager, root string) error { return m.Finish(root, id, outcome) })
}

func (a *App) CancelJob(path, id string) error {
	return a.withManager(path, func(m *jobs.Manager, root string) error { return m.Cancel(root, id) })
}

func (a *App) ReviewComments(path, id string) error {
	return a.withManager(path, func(m *jobs.Manager, root string) error { return m.ReviewComments(root, id) })
}

func (a *App) OpenPulls(path string, urls []string) (map[string]bool, error) {
	root, err := setup.ProjectRoot(path)
	if err != nil {
		return nil, err
	}
	return jobs.OpenPulls(root, urls)
}
