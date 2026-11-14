package jobs

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"time"

	"github.com/rexchoppers/trellis/internal/config"
)

// How long a helper session may take to publish before the agent is told it failed.
const artifactLimit = 30 * time.Minute

const artifactPoll = 5 * time.Second

// A background session refuses writes in a git checkout until it enters a worktree; the helper only writes ignored scratch files.
const artifactSettings = `{"worktree":{"bgIsolation":"none"},"autoMemoryEnabled":false}`

var (
	backgroundID = regexp.MustCompile(`claude stop ([0-9a-f]{8})`)
	artifactLine = regexp.MustCompile(`ARTIFACT_URL: (https://claude\.ai/[A-Za-z0-9/_-]+)`)
	artifactURL  = regexp.MustCompile(`https://claude\.ai/(?:code/)?artifact/[A-Za-z0-9_-]+`)
)

func (m *Manager) onArtifact(l *live, args json.RawMessage) (string, error) {
	var in struct {
		Kind  string `json:"kind"`
		Title string `json:"title"`
		Brief string `json:"brief"`
		URL   string `json:"url"`
	}
	_ = json.Unmarshal(args, &in)
	in.Kind, in.Title, in.Brief, in.URL = strings.TrimSpace(in.Kind), strings.TrimSpace(in.Title), strings.TrimSpace(in.Brief), strings.TrimSpace(in.URL)
	intent := map[string]string{"design": "design", "page": "other"}[in.Kind]
	if intent == "" {
		return "", errors.New("kind must be design or page")
	}
	if in.Title == "" || in.Brief == "" {
		return "", errors.New("title and brief are required")
	}
	// Trellis's own tools skip the permission gate, so the step check happens here.
	if owners := l.agent.StepFor(config.ArtifactTool, nil, l.names); len(owners) > 0 {
		if current := activeStep(l.root, l.id); !slices.Contains(owners, current) {
			return "", fmt.Errorf("artifact only works in the %s step. Call step with name %q and status active first, once that step really is where you are.", strings.Join(owners, " or "), owners[0])
		}
	}
	m.setDoing(l, "Making an artifact")
	// Published files must sit under the helper's working directory, and the job folder is ignored by git.
	scratch, err := os.MkdirTemp(Dir(l.root, l.id), "artifact-")
	if err != nil {
		return "", err
	}
	url, err := makeArtifact(l.root, scratch, artifactPrompt(intent, in.Title, in.Brief, in.URL, scratch))
	if err != nil {
		return "", err
	}
	return "Published: " + url, nil
}

func artifactPrompt(intent, title, brief, url, scratch string) string {
	var b strings.Builder
	b.WriteString("You make one Artifact for an agent that cannot use the Artifact tool itself. Nobody reads this session or answers questions: make sensible choices and never stop to ask.\n\n")
	fmt.Fprintf(&b, "Title: %s\n", title)
	if url != "" {
		fmt.Fprintf(&b, "Change the existing artifact %s: read it with the Artifact tool first, keep everything the brief does not change, and publish to that same url.\n", url)
	} else {
		fmt.Fprintf(&b, "Call Artifact quickstart with intent %q and design_systems false, then make and publish it as that result says.\n", intent)
	}
	fmt.Fprintf(&b, "Write local files only under %s, and publish from there (use it as root where a root is needed).\n", scratch)
	b.WriteString("When it is published, end with one line: ARTIFACT_URL: <the url>\n\nBrief:\n")
	b.WriteString(brief)
	return b.String()
}

func makeArtifact(dir, scratch, prompt string) (string, error) {
	// Leading slash: a rule path starting // is absolute.
	tools := fmt.Sprintf("Artifact,ArtifactData,Read,Glob,Grep,Skill,ToolSearch,Write(/%[1]s/**),Edit(/%[1]s/**)", scratch)
	// The prompt goes first: --allowedTools takes every value after it.
	cmd := exec.Command("claude", "--bg", prompt, "--setting-sources", "", "--settings", artifactSettings, "--strict-mcp-config", "--permission-mode", "dontAsk", "--allowedTools", tools)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "CLAUDE_CODE_DISABLE_AUTO_MEMORY=1")
	out, err := cmd.CombinedOutput()
	match := backgroundID.FindSubmatch(out)
	if match == nil {
		if err == nil {
			err = errors.New(strings.TrimSpace(string(out)))
		}
		return "", fmt.Errorf("Couldn't start the artifact helper: %v", err)
	}
	id := string(match[1])
	started := time.Now()
	deadline := started.Add(artifactLimit)
	for {
		sessionID, state, err := backgroundState(id)
		if err != nil {
			return "", err
		}
		if sessionID == "" && time.Since(started) > 2*time.Minute {
			return "", fmt.Errorf("The artifact helper %s never showed up in `claude agents`.", id)
		}
		if state != "" && state != "working" {
			if state == "done" {
				if url := publishedURL(sessionID); url != "" {
					_ = exec.Command("claude", "rm", id).Run()
					return url, nil
				}
			}
			return "", fmt.Errorf("The artifact helper stopped without publishing (state %s). The human can open it with `claude attach %s` to see why.", state, id)
		}
		if time.Now().After(deadline) {
			_ = exec.Command("claude", "stop", id).Run()
			return "", fmt.Errorf("The artifact helper took over %s and was stopped. The human can read it with `claude logs %s`.", artifactLimit, id)
		}
		time.Sleep(artifactPoll)
	}
}

func backgroundState(id string) (sessionID, state string, err error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, "claude", "agents", "--json", "--all").Output()
	if err != nil {
		return "", "", fmt.Errorf("Couldn't read the artifact helper's state: %v", err)
	}
	var sessions []struct {
		ID        string `json:"id"`
		SessionID string `json:"sessionId"`
		State     string `json:"state"`
	}
	if err := json.Unmarshal(out, &sessions); err != nil {
		return "", "", fmt.Errorf("Couldn't read the artifact helper's state: %v", err)
	}
	for _, s := range sessions {
		if s.ID == id {
			return s.SessionID, s.State, nil
		}
	}
	return "", "", nil
}

// The helper's closing line, else the last artifact link its transcript mentions.
func publishedURL(sessionID string) string {
	home, err := os.UserHomeDir()
	if err != nil || sessionID == "" {
		return ""
	}
	paths, _ := filepath.Glob(filepath.Join(home, ".claude", "projects", "*", sessionID+".jsonl"))
	if len(paths) == 0 {
		return ""
	}
	raw, err := os.ReadFile(paths[0])
	if err != nil {
		return ""
	}
	if all := artifactLine.FindAllSubmatch(raw, -1); len(all) > 0 {
		return string(all[len(all)-1][1])
	}
	if all := artifactURL.FindAll(raw, -1); len(all) > 0 {
		return string(all[len(all)-1])
	}
	return ""
}
