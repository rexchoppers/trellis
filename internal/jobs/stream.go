package jobs

import (
	"encoding/json"
	"fmt"
	"regexp"
	"slices"
	"strings"

	"github.com/rexchoppers/trellis/internal/config"
)

var issueID = regexp.MustCompile(`\b[A-Z][A-Z0-9]+-\d+\b`)

var linearURL = regexp.MustCompile(`https://linear\.app/[^\s"')]+`)

var fileEdits = []string{"Edit", "Write", "MultiEdit", "NotebookEdit"}

func toolName(name string) string {
	if parts := strings.SplitN(name, "__", 3); len(parts) == 3 && parts[0] == "mcp" {
		return parts[1] + " " + parts[2]
	}
	return name
}

func shorten(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

func subject(dir string, input json.RawMessage) string {
	s := config.Subject(input)
	if dir != "" {
		s = strings.TrimPrefix(strings.TrimPrefix(s, dir), "/")
	}
	return shorten(s, 160)
}

func doing(tool string) string {
	switch {
	case tool == "Read" || tool == "Grep" || tool == "Glob" || tool == "LS":
		return "Reading"
	case tool == "WebSearch" || tool == "WebFetch":
		return "Searching the web"
	case tool == "Bash":
		return "Running a command"
	case slices.Contains(fileEdits, tool):
		return "Writing code"
	case strings.Contains(strings.ToLower(tool), "linear"):
		return "Checking Linear"
	case strings.HasPrefix(tool, "mcp__"):
		return "Using " + strings.SplitN(strings.TrimPrefix(tool, "mcp__"), "__", 2)[0]
	}
	return "Working"
}

func (m *Manager) setDoing(l *live, what string) {
	job, err := Load(l.root, l.id)
	if err != nil || job.Doing == what {
		return
	}
	_, _ = m.update(l.root, l.id, func(j *Job) { j.Doing = what })
	m.changed(l.root, l.id)
}

func (m *Manager) line(l *live, raw []byte) {
	var event struct {
		Type       string `json:"type"`
		Subtype    string `json:"subtype"`
		IsError    bool   `json:"is_error"`
		Result     string `json:"result"`
		MCPServers []struct {
			Name   string `json:"name"`
			Status string `json:"status"`
		} `json:"mcp_servers"`
		Message struct {
			Content json.RawMessage `json:"content"`
		} `json:"message"`
	}
	if json.Unmarshal(raw, &event) != nil {
		return
	}
	type item struct {
		Type      string          `json:"type"`
		Text      string          `json:"text"`
		Thinking  string          `json:"thinking"`
		ID        string          `json:"id"`
		Name      string          `json:"name"`
		Input     json.RawMessage `json:"input"`
		ToolUseID string          `json:"tool_use_id"`
		IsError   bool            `json:"is_error"`
		Content   json.RawMessage `json:"content"`
	}
	var items []item
	_ = json.Unmarshal(event.Message.Content, &items)

	switch event.Type {
	case "system":
		if event.Subtype != "init" {
			return
		}
		l.mu.Lock()
		first := !l.reported
		l.reported = true
		l.mu.Unlock()
		if !first {
			return
		}
		for _, server := range event.MCPServers {
			if server.Name != "trellis" && server.Status != "connected" {
				m.note(l.root, l.id, fmt.Sprintf("%s did not connect (%s), so the agent can't use it.", server.Name, server.Status))
			}
		}
	case "assistant":
		// Activity after a check-in: the agent took up a message that was waiting.
		if job, err := Load(l.root, l.id); err == nil && job.State == NeedsYou && job.Reason == ForCheckIn {
			_, _ = m.update(l.root, l.id, func(j *Job) { j.State, j.Reason = Working, "" })
			m.changed(l.root, l.id)
		}
		for _, it := range items {
			switch it.Type {
			case "text":
				if text := strings.TrimSpace(it.Text); text != "" {
					l.mu.Lock()
					l.lastText = text
					l.mu.Unlock()
					m.say(l.root, l.id, Entry{From: "agent", Kind: "text", Text: text})
				}
			case "thinking":
				m.setDoing(l, "Thinking")
				if thought := strings.TrimSpace(it.Thinking); thought != "" {
					m.say(l.root, l.id, Entry{From: "agent", Kind: "thinking", Text: thought})
				}
			case "tool_use":
				l.mu.Lock()
				l.calls[it.ID] = call{name: it.Name, input: it.Input}
				l.mu.Unlock()
				if strings.HasPrefix(it.Name, "mcp__trellis__") || it.Name == "ToolSearch" {
					continue
				}
				m.setDoing(l, doing(it.Name))
				m.say(l.root, l.id, Entry{From: "agent", Kind: "step", Tool: toolName(it.Name), Input: subject(l.dir, it.Input)})
			}
		}
	case "user":
		for _, it := range items {
			if it.Type != "tool_result" || it.IsError {
				continue
			}
			l.mu.Lock()
			c, ok := l.calls[it.ToolUseID]
			l.mu.Unlock()
			if ok {
				m.produced(l, c, resultText(it.Content))
			}
		}
	case "result":
		m.setDoing(l, "")
		l.mu.Lock()
		l.turns = max(l.turns-1, 0)
		more, checked, last, ending := l.turns > 0, l.checkedIn, l.lastText, l.ending
		l.checkedIn, l.lastText = false, ""
		if checked {
			// Claude Code can take several waiting messages in one turn, so a check-in settles the count.
			l.turns, more = 0, false
		}
		l.mu.Unlock()
		if event.IsError && strings.TrimSpace(event.Result) != "" {
			m.note(l.root, l.id, shorten(event.Result, 300))
		}
		if ending {
			return
		}
		if checked {
			_, _ = m.update(l.root, l.id, func(j *Job) {
				if j.State == Working {
					j.State, j.Reason = NeedsYou, ForCheckIn
				}
			})
			m.changed(l.root, l.id)
			return
		}
		if more {
			return
		}
		// The agent stopped without checking in: it still comes back to you.
		if last == "" {
			last = "Stopped without a summary."
		}
		m.say(l.root, l.id, Entry{From: "agent", Kind: "check_in", Text: last})
		_, _ = m.update(l.root, l.id, func(j *Job) { j.State, j.Reason = NeedsYou, ForCheckIn })
		m.changed(l.root, l.id)
	}
}

func resultText(content json.RawMessage) string {
	var text string
	if json.Unmarshal(content, &text) == nil {
		return text
	}
	var parts []struct {
		Text string `json:"text"`
	}
	_ = json.Unmarshal(content, &parts)
	var b strings.Builder
	for _, p := range parts {
		b.WriteString(p.Text + "\n")
	}
	return b.String()
}

func (m *Manager) produced(l *live, c call, result string) {
	var add []Produced
	switch {
	case slices.Contains(fileEdits, c.name):
		if path := subject(l.dir, c.input); path != "" {
			add = append(add, Produced{Kind: "file", Label: path})
		}
	case strings.HasPrefix(c.name, "mcp__") && !strings.HasPrefix(c.name, "mcp__trellis__") && l.agent.Classify(c.name, c.input, l.names) != config.Free:
		url := linearURL.FindString(result)
		for _, id := range issueID.FindAllString(result, 3) {
			add = append(add, Produced{Kind: "issue", Label: id, URL: url})
			url = ""
		}
	}
	if len(add) == 0 {
		return
	}
	_, _ = m.update(l.root, l.id, func(j *Job) {
		for _, p := range add {
			if !slices.ContainsFunc(j.Produced, func(have Produced) bool { return have.Kind == p.Kind && have.Label == p.Label }) {
				j.Produced = append(j.Produced, p)
			}
		}
	})
	m.changed(l.root, l.id)
}
