package jobs

import (
	"bufio"
	"encoding/json"
	"io"
	"os"
	"os/exec"
	"sync"
)

type session struct {
	cmd   *exec.Cmd
	mu    sync.Mutex
	stdin io.WriteCloser
	done  chan struct{}
	// Set when Trellis closed the session on purpose, so its exit is not a crash.
	closing bool
}

// Claude Code holds a tool call open this long at most; a permission request may wait hours.
const toolTimeout = "86400000"

// Allowing a call echoes its input back via the permission tool; past the default 25k-token cap a cut result can't be read as an answer.
const outputTokens = "2000000"

func startSession(dir string, args []string, log io.Writer, onLine func([]byte), onExit func(err error)) (*session, error) {
	cmd := exec.Command("claude", args...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "CLAUDE_CODE_DISABLE_AUTO_MEMORY=1", "MCP_TOOL_TIMEOUT="+toolTimeout, "MAX_MCP_OUTPUT_TOKENS="+outputTokens)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	cmd.Stderr = log
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	s := &session{cmd: cmd, stdin: stdin, done: make(chan struct{})}
	go func() {
		scanner := bufio.NewScanner(stdout)
		scanner.Buffer(make([]byte, 1024*1024), 64*1024*1024)
		for scanner.Scan() {
			line := scanner.Bytes()
			_, _ = log.Write(append(append([]byte{}, line...), '\n'))
			onLine(line)
		}
		err := cmd.Wait()
		close(s.done)
		s.mu.Lock()
		closing := s.closing
		s.mu.Unlock()
		if !closing {
			onExit(err)
		}
	}()
	return s, nil
}

func (s *session) send(text string) error {
	raw, err := json.Marshal(map[string]any{"type": "user", "message": map[string]any{"role": "user", "content": text}})
	if err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err = s.stdin.Write(append(raw, '\n'))
	return err
}

func (s *session) close() {
	s.mu.Lock()
	s.closing = true
	_ = s.stdin.Close()
	s.mu.Unlock()
}

func (s *session) kill() {
	s.mu.Lock()
	s.closing = true
	s.mu.Unlock()
	if s.cmd.Process != nil {
		_ = s.cmd.Process.Kill()
	}
}
