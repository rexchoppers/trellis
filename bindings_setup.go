package main

import (
	"os/exec"

	"github.com/rexchoppers/trellis/internal/setup"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

func (a *App) Status() (setup.Status, error) {
	return a.setup.Status()
}

func (a *App) ChooseFolder() (string, error) {
	return runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{Title: "Choose the project folder"})
}

func (a *App) SaveProject(input setup.ProjectInput) (setup.ProjectStatus, error) {
	return a.setup.SaveProject(input)
}

func (a *App) Projects() ([]setup.ProjectStatus, error) {
	return a.setup.Projects()
}

func (a *App) ForgetProject(path string) error {
	return a.setup.ForgetProject(path)
}

func (a *App) ShowInFinder(path string) error {
	return exec.Command("open", path).Start()
}
