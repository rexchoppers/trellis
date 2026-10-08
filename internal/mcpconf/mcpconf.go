package mcpconf

import (
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
)

type Server struct {
	Name string `json:"name"`
	// user (~/.claude.json), project (.mcp.json) or local (~/.claude.json, this project only).
	Scope  string          `json:"scope"`
	Config json.RawMessage `json:"-"`
}

type servers map[string]json.RawMessage

// Like Claude Code, local beats project beats user when a name is defined twice.
func Discover(home, root string) (map[string]Server, error) {
	found := map[string]Server{}
	var claude struct {
		MCPServers servers `json:"mcpServers"`
		Projects   map[string]struct {
			MCPServers servers `json:"mcpServers"`
		} `json:"projects"`
	}
	if err := readJSON(filepath.Join(home, ".claude.json"), &claude); err != nil {
		return nil, err
	}
	var project struct {
		MCPServers servers `json:"mcpServers"`
	}
	if err := readJSON(filepath.Join(root, ".mcp.json"), &project); err != nil {
		return nil, err
	}
	add := func(scope string, list servers) {
		for name, config := range list {
			found[name] = Server{Name: name, Scope: scope, Config: config}
		}
	}
	add("user", claude.MCPServers)
	add("project", project.MCPServers)
	add("local", claude.Projects[root].MCPServers)
	return found, nil
}

func readJSON(path string, into any) error {
	raw, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	return json.Unmarshal(raw, into)
}
