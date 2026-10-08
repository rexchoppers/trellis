package shellenv

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

const marker = "__TRELLIS_PATH__"

// An app opened from Finder gets launchd's bare PATH, so the user's claude, git and gh aren't found.
// UseLoginPath puts the login shell's PATH first; the shell runs interactive too, as installers often add to .zshrc.
// Launched from a terminal (TERM set), PATH is already the user's, so the slow shell start is skipped.
func UseLoginPath() {
	if runtime.GOOS == "windows" || os.Getenv("TERM") != "" {
		return
	}
	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/zsh"
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, shell, "-ilc", `printf '`+marker+`%s`+marker+`' "$PATH"`).Output()
	if err != nil && len(out) == 0 {
		return
	}
	parts := strings.Split(string(out), marker)
	if len(parts) < 3 || parts[1] == "" {
		return
	}
	os.Setenv("PATH", merge(parts[1], os.Getenv("PATH")))
}

func merge(first, rest string) string {
	seen := map[string]bool{}
	var dirs []string
	for _, dir := range filepath.SplitList(first + string(os.PathListSeparator) + rest) {
		if dir != "" && !seen[dir] {
			seen[dir] = true
			dirs = append(dirs, dir)
		}
	}
	return strings.Join(dirs, string(os.PathListSeparator))
}
