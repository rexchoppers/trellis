package jobs

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// Claude Code reads AGENTS.md only when a folder has no CLAUDE.md, and --add-dir loads CLAUDE.md alone, so Trellis passes AGENTS.md itself.
func agentsMD(dir string) string {
	if _, err := os.Stat(filepath.Join(dir, "CLAUDE.md")); err == nil {
		return ""
	}
	return withImports(filepath.Join(dir, "AGENTS.md"), 0)
}

var importRef = regexp.MustCompile(`(^|\s)@(\S+)`)

// Replaces each @path that names a file with that file's text, as Claude Code does, up to five levels deep.
func withImports(path string, depth int) string {
	text, err := os.ReadFile(path)
	if err != nil || depth > 4 {
		return ""
	}
	return importRef.ReplaceAllStringFunc(string(text), func(match string) string {
		parts := importRef.FindStringSubmatch(match)
		target := parts[2]
		if home, err := os.UserHomeDir(); err == nil && strings.HasPrefix(target, "~/") {
			target = filepath.Join(home, target[2:])
		} else if !filepath.IsAbs(target) {
			target = filepath.Join(filepath.Dir(path), target)
		}
		if info, err := os.Stat(target); err != nil || info.IsDir() {
			return match
		}
		return parts[1] + withImports(target, depth+1)
	})
}
