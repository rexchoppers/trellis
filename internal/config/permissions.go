package config

import (
	"encoding/json"
	"path"
	"regexp"
	"slices"
	"strings"
)

type Level string

const (
	Free  Level = "free"
	Ask   Level = "ask"
	Never Level = "never"
)

var BuiltIn = []string{"Read", "Grep", "Glob", "LS", "Bash", "Edit", "Write", "MultiEdit", "NotebookEdit", "WebFetch", "WebSearch", "Task"}

// Server name to the project's nicknames for it.
type Names map[string][]string

func NamesOf(project Project) Names {
	names := Names{}
	for nick, server := range project.MCP {
		names[server] = append(names[server], nick)
	}
	for server := range names {
		slices.Sort(names[server])
	}
	return names
}

func mcpTool(tool string) (server, name string, ok bool) {
	parts := strings.SplitN(tool, "__", 3)
	if len(parts) != 3 || parts[0] != "mcp" {
		return "", "", false
	}
	return parts[1], parts[2], true
}

func (a Agent) Classify(tool string, input json.RawMessage, names Names) Level {
	switch {
	case strings.HasPrefix(tool, "mcp__trellis__"), tool == "ToolSearch", tool == "TodoWrite":
		return Free
	case matchesAny(a.Permissions.Ask, tool, input, names), slices.ContainsFunc(segments(tool, input), func(part json.RawMessage) bool { return matchesAny(a.Permissions.Ask, tool, part, names) }):
		return Ask
	case matchesAny(a.Permissions.Free, tool, input, names):
		return Free
	}
	return Never
}

var chain = regexp.MustCompile(`&&|\|\||[;|\n&]`)

// Splits a chained Bash command so an ask rule still catches its command anywhere in the chain.
func segments(tool string, input json.RawMessage) []json.RawMessage {
	if tool != "Bash" {
		return nil
	}
	var out []json.RawMessage
	for _, part := range chain.Split(Subject(input), -1) {
		part = strings.TrimLeft(strings.TrimSpace(part), "({ ")
		if part == "" {
			continue
		}
		raw, _ := json.Marshal(map[string]string{"command": part})
		out = append(out, raw)
	}
	return out
}

func (a Agent) Off() []string {
	var off []string
	for _, tool := range BuiltIn {
		listed := slices.ContainsFunc(slices.Concat(a.Permissions.Free, a.Permissions.Ask), func(rule string) bool {
			return strings.SplitN(strings.TrimSpace(rule), "(", 2)[0] == tool
		})
		if !listed {
			off = append(off, tool)
		}
	}
	return off
}

func matchesAny(rules []string, tool string, input json.RawMessage, names Names) bool {
	for _, rule := range rules {
		if matches(rule, tool, input, names) {
			return true
		}
	}
	return false
}

// Rule forms: server/tool by nickname or real name (* wildcard); Tool or Tool(arg *) matched against the command, path or URL; or a full mcp__ name.
func matches(rule, tool string, input json.RawMessage, names Names) bool {
	rule = strings.TrimSpace(rule)
	if server, pattern, ok := strings.Cut(rule, "/"); ok && !strings.Contains(server, "(") {
		real, name, isMCP := mcpTool(tool)
		if !isMCP || (server != real && !slices.Contains(names[real], server)) {
			return false
		}
		matched, _ := path.Match(pattern, name)
		return matched
	}
	if strings.HasPrefix(rule, "mcp__") {
		matched, _ := path.Match(rule, tool)
		return matched
	}
	name, spec, hasSpec := strings.Cut(strings.TrimSuffix(rule, ")"), "(")
	if name != tool {
		return false
	}
	if !hasSpec || spec == "" || spec == "*" {
		return true
	}
	subject := Subject(input)
	// A rule names one command; a chained one could run anything after it.
	if tool == "Bash" && strings.ContainsAny(subject, ";&|`\n$<>") {
		return false
	}
	if prefix, ok := strings.CutSuffix(spec, "*"); ok {
		return strings.HasPrefix(subject, strings.TrimRight(prefix, " ")) || strings.HasPrefix(subject, prefix)
	}
	return subject == spec
}

func Subject(input json.RawMessage) string {
	var fields map[string]any
	if json.Unmarshal(input, &fields) != nil {
		return ""
	}
	for _, key := range []string{"command", "file_path", "path", "url", "pattern", "query", "title"} {
		if v, ok := fields[key].(string); ok {
			return v
		}
	}
	return ""
}

func Rule(tool string, names Names) string {
	server, name, ok := mcpTool(tool)
	if !ok {
		return tool
	}
	if nicks := names[server]; len(nicks) > 0 {
		server = nicks[0]
	}
	return server + "/" + name
}

func (a Agent) Allow(tool string, input json.RawMessage, names Names) Agent {
	a.Permissions.Ask = slices.DeleteFunc(slices.Clone(a.Permissions.Ask), func(rule string) bool { return matches(rule, tool, input, names) })
	a.Permissions.Free = append(a.Permissions.Free, Rule(tool, names))
	return a
}

func (a Agent) Nicknames(servers []string, names Names) []string {
	known := map[string]bool{}
	for _, server := range servers {
		known[server] = true
		for _, nick := range names[server] {
			known[nick] = true
		}
	}
	var missing []string
	for _, rule := range slices.Concat(a.Permissions.Free, a.Permissions.Ask) {
		if server, _, ok := strings.Cut(strings.TrimSpace(rule), "/"); ok && !strings.Contains(server, "(") && !known[server] && !slices.Contains(missing, server) {
			missing = append(missing, server)
		}
	}
	return missing
}

func (a Agent) StepFor(tool string, input json.RawMessage, names Names) []string {
	var steps []string
	for _, step := range a.Steps {
		if matchesAny(step.Tools, tool, input, names) {
			steps = append(steps, step.Name)
		}
	}
	return steps
}

func (a Agent) StepTool(rule string) bool {
	for _, step := range a.Steps {
		if slices.Contains(step.Tools, rule) {
			return true
		}
	}
	return false
}

func (a Agent) UsesServer(server string, names Names) bool {
	rules := slices.Concat(a.Permissions.Free, a.Permissions.Ask)
	for _, step := range a.Steps {
		rules = append(rules, step.Tools...)
	}
	for _, rule := range rules {
		rule = strings.TrimSpace(rule)
		if prefix, _, ok := strings.Cut(rule, "/"); ok && !strings.Contains(prefix, "(") && (prefix == server || slices.Contains(names[server], prefix)) {
			return true
		}
		if strings.HasPrefix(rule, "mcp__") {
			if matched, _ := path.Match(rule, "mcp__"+server+"__x"); matched || strings.HasPrefix(rule, "mcp__"+server+"__") {
				return true
			}
		}
	}
	return false
}
