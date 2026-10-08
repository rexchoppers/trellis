package main

import (
	"context"
	"errors"
	"os"

	"github.com/rexchoppers/trellis/internal/gate"
	"github.com/rexchoppers/trellis/internal/jobs"
	"github.com/rexchoppers/trellis/internal/setup"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	ctx   context.Context
	setup *setup.Service
	gate  *gate.Server
	jobs  *jobs.Manager
}

type JobChanged struct {
	Path string `json:"path"`
	ID   string `json:"id"`
}

func NewApp(service *setup.Service) *App {
	return &App{setup: service}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.gate = gate.New()
	if err := a.gate.Start(); err != nil {
		runtime.LogErrorf(ctx, "gate: %v", err)
		return
	}
	home, _ := os.UserHomeDir()
	a.jobs = &jobs.Manager{Gate: a.gate, Home: home, Changed: func(root, id string) {
		runtime.EventsEmit(a.ctx, "job", JobChanged{Path: root, ID: id})
	}}
}

func (a *App) shutdown(context.Context) {
	if a.jobs != nil {
		a.jobs.Close()
	}
	if a.gate != nil {
		_ = a.gate.Close()
	}
}

func (a *App) manager(path string) (*jobs.Manager, string, error) {
	if a.jobs == nil {
		return nil, "", errors.New("Trellis couldn't start its agent server. Restart Trellis.")
	}
	root, err := setup.ProjectRoot(path)
	return a.jobs, root, err
}

func (a *App) withManager(path string, fn func(m *jobs.Manager, root string) error) error {
	m, root, err := a.manager(path)
	if err != nil {
		return err
	}
	return fn(m, root)
}

func managed[T any](a *App, path string, fn func(m *jobs.Manager, root string) (T, error)) (T, error) {
	m, root, err := a.manager(path)
	if err != nil {
		var zero T
		return zero, err
	}
	return fn(m, root)
}
