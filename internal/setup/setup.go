package setup

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"

	"github.com/rexchoppers/trellis/internal/config"
)

type Service struct {
	ConfigDir string
}

type ProjectStatus struct {
	Path    string         `json:"path"`
	Name    string         `json:"name"`
	Places  []config.Place `json:"places"`
	NPCs    []config.NPC   `json:"npcs"`
	Missing bool           `json:"missing"`
}

func ProjectRoot(path string) (string, error) { return folder(path) }

type ProjectInput struct {
	Path string `json:"path"`
	Name string `json:"name"`
}

func (s *Service) SaveProject(input ProjectInput) (ProjectStatus, error) {
	root, err := folder(input.Path)
	if err != nil {
		return ProjectStatus{}, err
	}
	// Keep what the form does not edit, such as the MCP nicknames.
	project, _, err := config.LoadProject(root)
	if err != nil {
		return ProjectStatus{}, err
	}
	project.Name = fallback(input.Name, filepath.Base(root))
	if err := config.SaveProject(root, project); err != nil {
		return ProjectStatus{}, err
	}

	user, _, err := config.LoadUser(s.ConfigDir)
	if err != nil {
		return ProjectStatus{}, err
	}
	if !slices.Contains(user.Projects, root) {
		user.Projects = append([]string{root}, user.Projects...)
		if err := config.SaveUser(s.ConfigDir, user); err != nil {
			return ProjectStatus{}, err
		}
	}
	return projectStatus(root)
}

func (s *Service) Projects() ([]ProjectStatus, error) {
	user, _, err := config.LoadUser(s.ConfigDir)
	if err != nil {
		return nil, err
	}
	projects := make([]ProjectStatus, 0, len(user.Projects))
	for _, path := range user.Projects {
		if info, err := os.Stat(path); err != nil || !info.IsDir() {
			projects = append(projects, ProjectStatus{Path: path, Name: filepath.Base(path), Missing: true})
			continue
		}
		project, err := projectStatus(path)
		if err != nil {
			return nil, err
		}
		projects = append(projects, project)
	}
	return projects, nil
}

func (s *Service) ForgetProject(path string) error {
	user, _, err := config.LoadUser(s.ConfigDir)
	if err != nil {
		return err
	}
	user.Projects = slices.DeleteFunc(user.Projects, func(candidate string) bool { return candidate == path })
	return config.SaveUser(s.ConfigDir, user)
}

func projectStatus(root string) (ProjectStatus, error) {
	project, _, err := config.LoadProject(root)
	if err != nil {
		return ProjectStatus{}, err
	}
	places, err := config.LoadPlaces(root)
	if err != nil {
		return ProjectStatus{}, err
	}
	npcs, err := config.LoadNPCs(root)
	if err != nil {
		return ProjectStatus{}, err
	}
	return ProjectStatus{Path: root, Name: project.Name, Places: places, NPCs: npcs}, nil
}

func folder(path string) (string, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return "", errors.New("A project folder is required")
	}
	if rest, ok := strings.CutPrefix(path, "~/"); ok {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		path = filepath.Join(home, rest)
	}
	root, err := filepath.Abs(path)
	if err != nil {
		return "", err
	}
	info, err := os.Stat(root)
	if err != nil || !info.IsDir() {
		return "", fmt.Errorf("Folder %s does not exist", root)
	}
	return root, nil
}

func fallback(value, otherwise string) string {
	if value = strings.TrimSpace(value); value != "" {
		return value
	}
	return otherwise
}
