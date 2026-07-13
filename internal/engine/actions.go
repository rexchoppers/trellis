package engine

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"regexp"
	"strconv"
	"strings"

	"github.com/rexchoppers/trellis/internal/linear"
	"github.com/rexchoppers/trellis/internal/model"
)

// ActionRunner executes action nodes: deterministic git/GitHub/Linear side
// effects. Agents compute; actions own the side effects, mirroring the old
// agent-pipeline split. The working directory is passed per call because each
// run resolves its own (pipelines can target different clones). Exec is
// injectable for tests.
type ActionRunner struct {
	Linear *linear.Client
	Exec   func(ctx context.Context, dir, name string, args ...string) (string, error)
}

func execCommand(ctx context.Context, dir, name string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Dir = dir
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("%s %s: %w: %s", name, strings.Join(args, " "), err, strings.TrimSpace(stderr.String()))
	}
	return strings.TrimSpace(stdout.String()), nil
}

func (a *ActionRunner) run(ctx context.Context, workdir, name string, args ...string) (string, error) {
	if a.Exec != nil {
		return a.Exec(ctx, workdir, name, args...)
	}
	return execCommand(ctx, workdir, name, args...)
}

// RenderTemplate substitutes {{key}} placeholders from context; unlike agent
// prompts, a key missing from context is an error.
func RenderTemplate(template string, context map[string]any) (string, error) {
	var missing []string
	out := template
	for _, key := range model.TemplateKeys(template) {
		value, ok := context[key]
		if !ok {
			missing = append(missing, key)
			continue
		}
		pattern := regexp.MustCompile(`\{\{\s*` + regexp.QuoteMeta(key) + `\s*\}\}`)
		out = pattern.ReplaceAllString(out, fmt.Sprintf("%v", value))
	}
	if len(missing) > 0 {
		return "", fmt.Errorf("template references missing context keys: %s", strings.Join(missing, ", "))
	}
	return out, nil
}

var protectedBranches = map[string]bool{"master": true, "main": true}

var slugPattern = regexp.MustCompile(`[^a-z0-9]+`)

func slugify(s string) string {
	slug := strings.Trim(slugPattern.ReplaceAllString(strings.ToLower(s), "-"), "-")
	if len(slug) > 60 {
		slug = strings.Trim(slug[:60], "-")
	}
	if slug == "" {
		return "change"
	}
	return slug
}

// Run executes one action kind with already-rendered params in workdir and
// returns the context keys it produces.
func (a *ActionRunner) Run(ctx context.Context, kind string, params map[string]string, issueRef, workdir string) (map[string]any, error) {
	switch kind {
	case "git_create_branch":
		return a.gitCreateBranch(ctx, workdir, params["name"])
	case "git_commit":
		return a.gitCommit(ctx, workdir, params["message"])
	case "git_push":
		return a.gitPush(ctx, workdir)
	case "gh_open_pr":
		return a.ghOpenPR(ctx, workdir, params["title"], params["body"])
	case "gh_pr_comment":
		_, err := a.run(ctx, workdir, "gh", "pr", "comment", "--body", params["body"])
		return nil, err
	case "gh_pr_ready":
		// Tolerates an already-ready PR, like the old pipeline.
		a.run(ctx, workdir, "gh", "pr", "ready")
		return nil, nil
	case "linear_comment":
		return nil, a.linearCall(issueRef, func(c *linear.Client) error {
			return c.AddComment(ctx, issueRef, params["body"])
		})
	case "linear_set_status":
		return nil, a.linearCall(issueRef, func(c *linear.Client) error {
			return c.SetStatus(ctx, issueRef, params["status"])
		})
	case "linear_append_description":
		return nil, a.linearCall(issueRef, func(c *linear.Client) error {
			return c.AppendDescription(ctx, issueRef, params["text"])
		})
	default:
		return nil, fmt.Errorf("unknown action %q", kind)
	}
}

func (a *ActionRunner) linearCall(issueRef string, call func(*linear.Client) error) error {
	if a.Linear == nil {
		return fmt.Errorf("LINEAR_API_KEY is not set; Linear actions need it exported before starting trellis")
	}
	if strings.TrimSpace(issueRef) == "" {
		return fmt.Errorf("no Linear issue on this run (issue_identifier missing from context)")
	}
	return call(a.Linear)
}

// requireRepo fails loudly, naming the directory, when the workdir is not a
// git repository; every raw git error after that would just be confusing.
func (a *ActionRunner) requireRepo(ctx context.Context, workdir string) error {
	if _, err := a.run(ctx, workdir, "git", "rev-parse", "--git-dir"); err != nil {
		return fmt.Errorf(
			"working directory %s is not a git repository; set the pipeline's Working directory to the clone the agents should work in (or launch trellis from it / use -workdir)",
			workdir,
		)
	}
	return nil
}

// defaultBase resolves the repository's default branch (origin/HEAD, falling
// back to master then main).
func (a *ActionRunner) defaultBase(ctx context.Context, workdir string) (string, error) {
	if out, err := a.run(ctx, workdir, "git", "symbolic-ref", "--short", "refs/remotes/origin/HEAD"); err == nil {
		return strings.TrimPrefix(out, "origin/"), nil
	}
	for _, candidate := range []string{"master", "main"} {
		if _, err := a.run(ctx, workdir, "git", "rev-parse", "--verify", "origin/"+candidate); err == nil {
			return candidate, nil
		}
	}
	return "", fmt.Errorf(
		"cannot determine the default branch in %s (no origin/HEAD, origin/master or origin/main); is this the right clone and does it have an origin remote?",
		workdir,
	)
}

func (a *ActionRunner) currentBranch(ctx context.Context, workdir string) (string, error) {
	return a.run(ctx, workdir, "git", "branch", "--show-current")
}

func (a *ActionRunner) gitCreateBranch(ctx context.Context, workdir, name string) (map[string]any, error) {
	if err := a.requireRepo(ctx, workdir); err != nil {
		return nil, err
	}
	branch := "pipeline/" + slugify(name)
	base, err := a.defaultBase(ctx, workdir)
	if err != nil {
		return nil, err
	}
	if _, err := a.run(ctx, workdir, "git", "fetch", "origin", base); err != nil {
		return nil, err
	}
	// The workdir is pipeline scratch: discard leftovers so the branch is a
	// clean cut off the base.
	a.run(ctx, workdir, "git", "reset", "--hard")
	a.run(ctx, workdir, "git", "clean", "-fd")
	if _, err := a.run(ctx, workdir, "git", "switch", "-C", branch, "origin/"+base); err != nil {
		return nil, err
	}
	current, err := a.currentBranch(ctx, workdir)
	if err != nil {
		return nil, err
	}
	if protectedBranches[current] {
		return nil, fmt.Errorf("refusing to operate on %s", current)
	}
	return map[string]any{"branch": branch}, nil
}

func (a *ActionRunner) gitCommit(ctx context.Context, workdir, message string) (map[string]any, error) {
	if err := a.requireRepo(ctx, workdir); err != nil {
		return nil, err
	}
	current, err := a.currentBranch(ctx, workdir)
	if err != nil {
		return nil, err
	}
	if protectedBranches[current] {
		return nil, fmt.Errorf("refusing to commit on %s", current)
	}
	status, err := a.run(ctx, workdir, "git", "status", "--porcelain")
	if err != nil {
		return nil, err
	}
	if status == "" {
		return map[string]any{"committed": "false"}, nil
	}
	if _, err := a.run(ctx, workdir, "git", "add", "-A"); err != nil {
		return nil, err
	}
	if _, err := a.run(ctx, workdir, "git", "commit", "-m", message); err != nil {
		return nil, err
	}
	return map[string]any{"committed": "true"}, nil
}

func (a *ActionRunner) gitPush(ctx context.Context, workdir string) (map[string]any, error) {
	if err := a.requireRepo(ctx, workdir); err != nil {
		return nil, err
	}
	current, err := a.currentBranch(ctx, workdir)
	if err != nil {
		return nil, err
	}
	if protectedBranches[current] {
		return nil, fmt.Errorf("refusing to push %s", current)
	}
	if _, err := a.run(ctx, workdir, "git", "push", "-u", "origin", current); err != nil {
		return nil, err
	}
	return nil, nil
}

type prInfo struct {
	Number int    `json:"number"`
	URL    string `json:"url"`
}

func (a *ActionRunner) openPR(ctx context.Context, workdir, branch string) (*prInfo, error) {
	out, err := a.run(ctx, workdir, "gh", "pr", "list", "--head", branch, "--state", "open", "--json", "number,url")
	if err != nil || strings.TrimSpace(out) == "" {
		return nil, err
	}
	var items []prInfo
	if err := json.Unmarshal([]byte(out), &items); err != nil {
		return nil, fmt.Errorf("gh pr list: %w: %s", err, out)
	}
	if len(items) == 0 {
		return nil, nil
	}
	return &items[0], nil
}

func (a *ActionRunner) ghOpenPR(ctx context.Context, workdir, title, body string) (map[string]any, error) {
	if err := a.requireRepo(ctx, workdir); err != nil {
		return nil, err
	}
	branch, err := a.currentBranch(ctx, workdir)
	if err != nil {
		return nil, err
	}
	if protectedBranches[branch] {
		return nil, fmt.Errorf("refusing to open a PR from %s", branch)
	}
	existing, err := a.openPR(ctx, workdir, branch)
	if err != nil {
		return nil, err
	}
	if existing == nil {
		base, err := a.defaultBase(ctx, workdir)
		if err != nil {
			return nil, err
		}
		// Only open a PR when the branch actually has commits, like the old
		// pipeline (a leg that changed nothing must not open an empty PR).
		count, err := a.run(ctx, workdir, "git", "rev-list", "--count", "origin/"+base+"..HEAD")
		if err != nil {
			return nil, err
		}
		if n, _ := strconv.Atoi(count); n == 0 {
			return map[string]any{"pr_number": "", "pr_url": ""}, nil
		}
		if _, err := a.run(ctx, workdir, "gh", "pr", "create", "--draft", "--base", base, "--head", branch,
			"--title", title, "--body", body); err != nil {
			return nil, err
		}
		if existing, err = a.openPR(ctx, workdir, branch); err != nil {
			return nil, err
		}
		if existing == nil {
			return nil, fmt.Errorf("gh pr create succeeded but the PR cannot be found for %s", branch)
		}
	}
	return map[string]any{"pr_number": strconv.Itoa(existing.Number), "pr_url": existing.URL}, nil
}
