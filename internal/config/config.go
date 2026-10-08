package config

import (
	"bytes"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

type User struct {
	Projects []string `yaml:"projects,omitempty"`
}

type Project struct {
	Name string `yaml:"name"`
	// Nickname to server name, so agent files read the same in every project.
	MCP map[string]string `yaml:"mcp,omitempty"`
}

type Department struct {
	Key    string  `yaml:"-" json:"key"`
	Name   string  `yaml:"name" json:"name"`
	Colour string  `yaml:"colour" json:"colour"`
	Order  int     `yaml:"order" json:"order"`
	Agents []Agent `yaml:"-" json:"agents"`
}

// Branches "own": the agent makes its own branches and PRs; Trellis only gives it the worktree.
type Agent struct {
	Key      string `yaml:"-" json:"key"`
	Name     string `yaml:"name" json:"name"`
	Task     string `yaml:"task,omitempty" json:"task"`
	Desks    Desks  `yaml:"desks" json:"desks"`
	Order    int    `yaml:"order,omitempty" json:"order"`
	Worktree bool   `yaml:"worktree,omitempty" json:"worktree"`
	Branches string `yaml:"branches,omitempty" json:"branches"`
	// Entries are department/agent.
	Delegates []string `yaml:"delegates,omitempty" json:"delegates"`
	// A duration such as 10m, at least 1m: the agent rests between checks and wakes on this timer.
	Every       string      `yaml:"every,omitempty" json:"every"`
	Model       string      `yaml:"model,omitempty" json:"model"`
	Permissions Permissions `yaml:"permissions" json:"permissions"`
	// A file whose body is used as the instructions (e.g. a .claude/agents file); its front matter is ignored.
	Instructions string    `yaml:"instructions,omitempty" json:"instructions"`
	Outcomes     []Outcome `yaml:"outcomes,omitempty" json:"outcomes"`
	Steps        []StepDef `yaml:"steps,omitempty" json:"steps"`
	Listens      []Listen  `yaml:"listens,omitempty" json:"listens"`
	// The instructions file's body, then this file's own body.
	Prompt string `yaml:"-" json:"-"`
	// Only this file's own body; this is what gets saved back.
	Body string `yaml:"-" json:"-"`
}

// Tools listed on a step are refused unless that step is active.
type StepDef struct {
	Name  string   `yaml:"name" json:"name"`
	Tools []string `yaml:"tools,omitempty" json:"tools"`
}

func (s *StepDef) UnmarshalYAML(node *yaml.Node) error {
	if node.Kind == yaml.ScalarNode {
		s.Name = node.Value
		return nil
	}
	type plain StepDef
	return node.Decode((*plain)(s))
}

func (s StepDef) MarshalYAML() (any, error) {
	if len(s.Tools) == 0 {
		return s.Name, nil
	}
	type plain StepDef
	return plain(s), nil
}

type Outcome struct {
	Name    string            `yaml:"name" json:"name"`
	Label   string            `yaml:"label" json:"label"`
	Publish string            `yaml:"publish,omitempty" json:"publish"`
	With    map[string]string `yaml:"with,omitempty" json:"with"`
	// Reopens the job that handed this one over, with this outcome's data as the message.
	Back bool `yaml:"back,omitempty" json:"back"`
	// Confirm makes the agent only propose this outcome; you finish the job yourself.
	Confirm bool              `yaml:"confirm,omitempty" json:"confirm"`
	Fields  map[string]string `yaml:"fields,omitempty" json:"fields"`
}

type Desks int

const Unlimited Desks = -1

func (d *Desks) UnmarshalYAML(node *yaml.Node) error {
	if strings.TrimSpace(node.Value) == "any" {
		*d = Unlimited
		return nil
	}
	var n int
	if err := node.Decode(&n); err != nil {
		return err
	}
	*d = Desks(n)
	return nil
}

func (d Desks) MarshalYAML() (any, error) {
	if d < 0 {
		return "any", nil
	}
	return int(d), nil
}

func (d Desks) Full(busy int) bool { return d >= 0 && busy >= max(int(d), 1) }

func (o Outcome) Missing(data map[string]string) []string {
	var missing []string
	for name := range o.Fields {
		if strings.TrimSpace(data[name]) == "" {
			missing = append(missing, name)
		}
	}
	sort.Strings(missing)
	return missing
}

type Listen struct {
	Event string            `yaml:"event" json:"event"`
	When  map[string]string `yaml:"when,omitempty" json:"when"`
}

type Permissions struct {
	Free []string `yaml:"free,omitempty" json:"free"`
	Ask  []string `yaml:"ask,omitempty" json:"ask"`
}

func DefaultDir() (string, error) {
	if dir := os.Getenv("TRELLIS_CONFIG_DIR"); dir != "" {
		return dir, nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".config", "trellis"), nil
}

func userPath(dir string) string { return filepath.Join(dir, "config.yaml") }

func projectDir(root string) string { return filepath.Join(root, ".trellis") }

func departmentsDir(root string) string { return filepath.Join(projectDir(root), "departments") }

func departmentDir(root, key string) string { return filepath.Join(departmentsDir(root), key) }

func agentsDir(root, department string) string {
	return filepath.Join(departmentDir(root, department), "agents")
}

func LoadUser(dir string) (User, bool, error) {
	var user User
	found, err := readYAML(userPath(dir), &user)
	return user, found, err
}

func SaveUser(dir string, user User) error {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	return writeYAML(userPath(dir), user, 0o600)
}

func LoadProject(root string) (Project, bool, error) {
	var project Project
	found, err := readYAML(filepath.Join(projectDir(root), "trellis.yaml"), &project)
	return project, found, err
}

func SaveProject(root string, project Project) error {
	dir := projectDir(root)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(dir, ".gitignore"), []byte("local.yaml\njobs/\nworktrees/\n"), 0o644); err != nil {
		return err
	}
	return writeYAML(filepath.Join(dir, "trellis.yaml"), project, 0o644)
}

// Listed rather than globbed, so a project path containing [ ] * or ? still loads.
func LoadDepartments(root string) ([]Department, error) {
	entries, err := os.ReadDir(departmentsDir(root))
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return nil, err
	}
	departments := make([]Department, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() || strings.HasPrefix(entry.Name(), ".") {
			continue
		}
		var department Department
		found, err := readYAML(filepath.Join(departmentDir(root, entry.Name()), "department.yaml"), &department)
		if err != nil {
			return nil, err
		}
		if !found {
			continue
		}
		department.Key = entry.Name()
		if department.Agents, err = loadAgents(root, department.Key); err != nil {
			return nil, err
		}
		departments = append(departments, department)
	}
	sort.SliceStable(departments, func(i, j int) bool { return departments[i].Order < departments[j].Order })
	return departments, nil
}

func loadAgents(root, department string) ([]Agent, error) {
	dir := agentsDir(root, department)
	entries, err := os.ReadDir(dir)
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return nil, err
	}
	agents := make([]Agent, 0, len(entries))
	for _, entry := range entries {
		name := entry.Name()
		// Hidden files are editor locks, drafts or macOS ._ files, not agents.
		if !entry.Type().IsRegular() || strings.HasPrefix(name, ".") || !strings.HasSuffix(name, ".md") {
			continue
		}
		path := filepath.Join(dir, name)
		raw, err := os.ReadFile(path)
		if err != nil {
			return nil, err
		}
		var agent Agent
		front, body := splitFrontmatter(raw)
		if err := yaml.Unmarshal(front, &agent); err != nil {
			return nil, fmt.Errorf("%s: %w", path, err)
		}
		agent.Key = strings.TrimSuffix(name, ".md")
		agent.Body = string(body)
		agent.Prompt = agent.Body
		if agent.Instructions != "" {
			shared, err := os.ReadFile(filepath.Join(root, filepath.Clean(agent.Instructions)))
			if err != nil {
				return nil, fmt.Errorf("%s: instructions: %w", path, err)
			}
			_, sharedBody := splitFrontmatter(shared)
			agent.Prompt = strings.TrimSpace(string(sharedBody) + "\n\n" + agent.Body)
		}
		// A hand-written file without desks still gets one.
		if agent.Desks == 0 {
			agent.Desks = 1
		}
		agents = append(agents, agent)
	}
	sort.SliceStable(agents, func(i, j int) bool { return agents[i].Order < agents[j].Order })
	return agents, nil
}

func SaveAgent(root, department string, agent Agent) error {
	if err := validKey(department); err != nil {
		return err
	}
	if err := validKey(agent.Key); err != nil {
		return err
	}
	front, err := yaml.Marshal(agent)
	if err != nil {
		return err
	}
	dir := agentsDir(root, department)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	var file bytes.Buffer
	file.WriteString("---\n")
	file.Write(front)
	file.WriteString("---\n")
	if prompt := strings.TrimSpace(agent.Body); prompt != "" {
		file.WriteString("\n" + prompt + "\n")
	}
	return os.WriteFile(filepath.Join(dir, agent.Key+".md"), file.Bytes(), 0o644)
}

func validKey(key string) error {
	if key == "" || strings.ContainsAny(key, `/\`) || strings.HasPrefix(key, ".") {
		return fmt.Errorf("invalid key %q", key)
	}
	return nil
}

func splitFrontmatter(raw []byte) (front, body []byte) {
	rest, ok := bytes.CutPrefix(raw, []byte("---\n"))
	if !ok {
		return nil, raw
	}
	front, body, ok = bytes.Cut(rest, []byte("\n---\n"))
	if !ok {
		return rest, nil
	}
	return front, bytes.TrimSpace(body)
}

func readYAML(path string, into any) (bool, error) {
	raw, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if err := yaml.Unmarshal(raw, into); err != nil {
		return true, fmt.Errorf("%s: %w", path, err)
	}
	return true, nil
}

func writeYAML(path string, value any, mode fs.FileMode) error {
	raw, err := yaml.Marshal(value)
	if err != nil {
		return err
	}
	return os.WriteFile(path, raw, mode)
}

func (a Agent) Interval() time.Duration {
	every, err := time.ParseDuration(strings.TrimSpace(a.Every))
	if err != nil || a.Every == "" {
		return 10 * time.Minute
	}
	return max(every, time.Minute)
}
