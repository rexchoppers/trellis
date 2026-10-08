package jobs

import (
	"bytes"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

func capture(dir, name string, args ...string) (string, error) {
	cmd := exec.Command(name, args...)
	cmd.Dir = dir
	var out, errOut bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &errOut
	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(errOut.String())
		if msg == "" {
			msg = err.Error()
		}
		return "", errors.New(msg)
	}
	return strings.TrimSpace(out.String()), nil
}

func git(dir string, args ...string) (string, error) {
	out, err := capture(dir, "git", args...)
	if err != nil {
		return "", fmt.Errorf("git %s: %w", args[0], err)
	}
	return out, nil
}

func worktreeDir(root, id string) string { return filepath.Join(root, ".trellis", "worktrees", id) }

func newWorktree(root, id, branch string) (dir, base string, err error) {
	base, err = git(root, "rev-parse", "HEAD")
	if err != nil {
		return "", "", err
	}
	dir = worktreeDir(root, id)
	args := []string{"worktree", "add", "--detach", dir, base}
	if branch != "" {
		args = []string{"worktree", "add", "-b", branch, dir, base}
	}
	if _, err := git(root, args...); err != nil {
		return "", "", err
	}
	return dir, base, nil
}

func addWorktree(root, id string) (dir, branch, base string, err error) {
	branch = "trellis/" + id
	dir, base, err = newWorktree(root, id, branch)
	if err != nil {
		return "", "", "", err
	}
	return dir, branch, base, nil
}

func addOwnWorktree(root, id string) (dir, base string, err error) {
	return newWorktree(root, id, "")
}

func reopenWorktree(root string, job Job, own bool) (string, error) {
	dir := worktreeDir(root, job.ID)
	if _, err := os.Stat(dir); err == nil {
		return dir, nil
	}
	if own {
		dir, _, err := addOwnWorktree(root, job.ID)
		return dir, err
	}
	if _, err := git(root, "worktree", "add", dir, job.Branch); err != nil {
		return "", err
	}
	return dir, nil
}

func uncommitted(dir string) (bool, error) {
	status, err := git(dir, "status", "--porcelain")
	return status != "", err
}

// A worktree git can't read counts as dirty.
func dirty(dir string) bool {
	changed, err := uncommitted(dir)
	return err != nil || changed
}

func openPR(dir, branch, base, title, body string) (string, error) {
	changed, err := uncommitted(dir)
	if err != nil {
		return "", err
	}
	if changed {
		if _, err := git(dir, "add", "-A"); err != nil {
			return "", err
		}
		if _, err := git(dir, "commit", "-m", title); err != nil {
			return "", err
		}
	}
	count, err := git(dir, "rev-list", "--count", base+"..HEAD")
	if err != nil {
		return "", err
	}
	if count == "0" {
		return "", nil
	}
	if _, err := git(dir, "push", "-u", "origin", branch); err != nil {
		return "", err
	}
	out, err := capture(dir, "gh", "pr", "create", "--head", branch, "--title", title, "--body", body)
	if err != nil {
		return "", fmt.Errorf("gh pr create: %w", err)
	}
	lines := strings.Split(out, "\n")
	return lines[len(lines)-1], nil
}

func removeWorktree(root, dir string) {
	_, _ = git(root, "worktree", "remove", "--force", dir)
}
