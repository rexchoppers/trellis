package jobs

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"

	"github.com/rexchoppers/trellis/internal/config"
	"github.com/rexchoppers/trellis/internal/gate"
	"github.com/rexchoppers/trellis/internal/mcpconf"
)

func (m *Manager) Start(root, department, agentKey, task string) (string, error) {
	return m.start(root, department, agentKey, task, nil, nil, nil)
}

func busy(root, department, agent string) (int, error) {
	list, err := List(root)
	if err != nil {
		return 0, err
	}
	count := 0
	for _, job := range list {
		if job.Department == department && job.Agent == agent && (job.State == Working || job.State == NeedsYou) {
			count++
		}
	}
	return count, nil
}

func (m *Manager) start(root, department, agentKey, task string, from *Origin, data map[string]string, parent *Link) (string, error) {
	d, agent, err := findAgent(root, department, agentKey)
	if err != nil {
		return "", err
	}
	count, err := busy(root, department, agentKey)
	if err != nil {
		return "", err
	}
	if agent.Desks.Full(count) {
		return "", fmt.Errorf("%s has no free desk", agent.Name)
	}
	if err := ensureIgnored(root); err != nil {
		return "", err
	}
	task = strings.TrimSpace(task)
	job := Job{ID: NewID(), Department: department, Agent: agentKey, Task: task, State: Working, Session: newSession(), Created: time.Now().UTC(), From: from, Parent: parent, Progress: newProgress(agent)}
	if agent.Worktree && agent.Branches == "own" {
		dir, base, err := addOwnWorktree(root, job.ID)
		if err != nil {
			return "", err
		}
		job.Worktree, job.Base = dir, base
	} else if agent.Worktree {
		dir, branch, base, err := addWorktree(root, job.ID)
		if err != nil {
			return "", err
		}
		job.Worktree, job.Branch, job.Base = dir, branch, base
	}
	if err := Save(root, job); err != nil {
		return "", err
	}
	if from != nil {
		m.say(root, job.ID, Entry{From: "trellis", Kind: "event", Text: from.Agent, Outcome: from.Event, Data: data})
	} else if parent != nil {
		m.say(root, job.ID, Entry{From: "parent", Kind: "task", By: parent.Name, Text: task})
	} else {
		m.say(root, job.ID, Entry{From: "you", Kind: "task", Text: task})
	}
	first := task
	if first == "" {
		first = "No task was given. Choose the most useful thing to do for your role right now, say why, and do it."
	}
	if err := m.run(root, job, d, agent, first); err != nil {
		return job.ID, err
	}
	return job.ID, nil
}

func (m *Manager) run(root string, job Job, d config.Department, agent config.Agent, first string) error {
	servers, err := mcpconf.Discover(m.Home, root)
	if err != nil {
		return m.fail(root, job.ID, err.Error())
	}
	project, _, err := config.LoadProject(root)
	if err != nil {
		return m.fail(root, job.ID, err.Error())
	}
	names := config.NamesOf(project)
	known := make([]string, 0, len(servers))
	for name := range servers {
		known = append(known, name)
	}
	if missing := agent.Nicknames(known, names); len(missing) > 0 {
		m.note(root, job.ID, fmt.Sprintf("%s's permissions mention %s, but this project has no MCP server by that name. Map it under mcp: in .trellis/trellis.yaml, for example %s: <server>.", agent.Name, strings.Join(missing, ", "), missing[0]))
	}
	dir := root
	if job.Worktree != "" {
		dir = job.Worktree
	}
	l := &live{root: root, id: job.ID, department: d, agent: agent, names: names, token: gate.NewToken(), dir: dir,
		waits: map[int]chan string{}, once: map[string]bool{}, calls: map[string]call{}}
	// Only the MCP servers the agent's rules mention: every server is a process, and most agents use one or two.
	used := map[string]mcpconf.Server{}
	for name, server := range servers {
		if agent.UsesServer(name, names) {
			used[name] = server
		}
	}
	configPath, err := writeMCPConfig(Dir(root, job.ID), used, m.Gate.URL(l.token))
	if err != nil {
		return m.fail(root, job.ID, err.Error())
	}
	tools := append(slices.Clone(gate.Tools), gate.FreshSession)
	if len(agent.Outcomes) > 0 {
		tools = append(tools, gate.Finish, gate.Publish)
	}
	if len(agent.Steps) > 0 {
		tools = append(tools, gate.Step)
	}
	if len(agent.Delegates) > 0 {
		tools = append(tools, gate.Delegate, gate.Message)
	}
	if agent.Every != "" {
		tools = append(tools, gate.Rest)
	}
	m.Gate.Register(l.token, tools, func(name string, args json.RawMessage) (string, error) {
		return m.tool(l, name, args)
	})
	log, err := os.OpenFile(filepath.Join(Dir(root, job.ID), "claude.jsonl"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		m.Gate.Revoke(l.token)
		return m.fail(root, job.ID, err.Error())
	}
	sess, err := startSession(dir, args(job, d, agent, configPath), log, func(line []byte) { m.line(l, line) }, func(err error) {
		_ = log.Close()
		m.exited(l, err)
	})
	if err != nil {
		_ = log.Close()
		m.Gate.Revoke(l.token)
		if errors.Is(err, os.ErrNotExist) || strings.Contains(err.Error(), "executable file not found") {
			return m.fail(root, job.ID, "Claude Code isn't installed or isn't on your PATH. Install it, run claude once to log in, then start the job again.")
		}
		return m.fail(root, job.ID, err.Error())
	}
	l.sess = sess
	m.mu.Lock()
	if m.live == nil {
		m.live = map[string]*live{}
	}
	m.live[job.ID] = l
	m.mu.Unlock()
	_, _ = m.update(root, job.ID, func(j *Job) {
		j.Started, j.State, j.Reason, j.Doing = true, Working, "", "Thinking"
	})
	m.changed(root, job.ID)
	return l.send(first)
}

func writeMCPConfig(dir string, servers map[string]mcpconf.Server, gateURL string) (string, error) {
	all := map[string]json.RawMessage{}
	for name, server := range servers {
		all[name] = server.Config
	}
	trellis, _ := json.Marshal(map[string]string{"type": "http", "url": gateURL})
	all["trellis"] = trellis
	raw, err := json.MarshalIndent(map[string]any{"mcpServers": all}, "", "  ")
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	path := filepath.Join(dir, "mcp.json")
	return path, os.WriteFile(path, raw, 0o600)
}

func (m *Manager) Send(root, id, text string) error {
	text = strings.TrimSpace(text)
	return m.deliver(root, id, Entry{From: "you", Kind: "message", Text: text}, text)
}

func (m *Manager) deliver(root, id string, entry Entry, text string) error {
	if strings.TrimSpace(entry.Text) == "" {
		return errors.New("Write a message first")
	}
	job, err := Load(root, id)
	if err != nil {
		return err
	}
	if job.Over() {
		return errors.New("This job is finished")
	}
	m.say(root, id, entry)
	if l := m.liveJob(id); l != nil {
		_, _ = m.update(root, id, func(j *Job) {
			if j.Reason != ForPermission {
				j.State, j.Reason, j.Doing = Working, "", "Thinking"
			}
			// Your reply reopens the question of how the job ends; the agent proposes again.
			j.Outcome, j.Data = "", nil
		})
		m.changed(root, id)
		return l.send(text)
	}
	d, agent, err := findAgent(root, job.Department, job.Agent)
	if err != nil {
		return err
	}
	return m.run(root, job, d, agent, text)
}
