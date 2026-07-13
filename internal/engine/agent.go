package engine

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"
)

type AgentRunner interface {
	// Run executes a prompt in workdir and returns the agent's final text.
	// model, when non-empty, is passed as --model (e.g. opus/sonnet/haiku);
	// empty inherits the claude CLI's default. progress, when non-nil, receives
	// human-readable chunks (assistant text, tool calls) as the agent works.
	Run(ctx context.Context, prompt, allowedTools, model, workdir string, progress func(chunk string)) (string, error)
}

// ClaudeCLI runs a prompt through the claude CLI (Claude Code) as a
// subprocess in the run's working directory, so generated code lands in the
// right project. allowedTools is passed through as --allowedTools; without it
// a headless claude run cannot write files or run commands. Output streams as
// JSON events so callers can watch the agent think.
type ClaudeCLI struct {
	Bin string
}

func (c ClaudeCLI) Run(ctx context.Context, prompt, allowedTools, model, workdir string, progress func(string)) (string, error) {
	args := []string{"-p", prompt, "--output-format", "stream-json", "--verbose"}
	if strings.TrimSpace(allowedTools) != "" {
		args = append(args, "--allowedTools", allowedTools)
	}
	if strings.TrimSpace(model) != "" {
		args = append(args, "--model", model)
	}
	cmd := exec.CommandContext(ctx, c.Bin, args...)
	cmd.Dir = workdir
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return "", err
	}
	if err := cmd.Start(); err != nil {
		return "", fmt.Errorf("claude cli: %w", err)
	}

	emit := func(chunk string) {
		if progress != nil && chunk != "" {
			progress(chunk)
		}
	}

	var finalResult string
	var transcript strings.Builder
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 1024*1024), 64*1024*1024)
	for scanner.Scan() {
		var event struct {
			Type    string `json:"type"`
			Result  string `json:"result"`
			Message struct {
				Content []struct {
					Type  string          `json:"type"`
					Text  string          `json:"text"`
					Name  string          `json:"name"`
					Input json.RawMessage `json:"input"`
				} `json:"content"`
			} `json:"message"`
		}
		if json.Unmarshal(scanner.Bytes(), &event) != nil {
			continue
		}
		switch event.Type {
		case "assistant":
			for _, block := range event.Message.Content {
				switch block.Type {
				case "text":
					transcript.WriteString(block.Text + "\n")
					emit(block.Text + "\n")
				case "tool_use":
					input := string(block.Input)
					if len(input) > 200 {
						input = input[:200] + "..."
					}
					summary := fmt.Sprintf("[%s] %s\n", block.Name, input)
					transcript.WriteString(summary)
					emit(summary)
				}
			}
		case "result":
			finalResult = event.Result
		}
	}
	scanErr := scanner.Err()
	if err := cmd.Wait(); err != nil {
		return "", fmt.Errorf("claude cli: %w: %s", err, strings.TrimSpace(stderr.String()))
	}
	if scanErr != nil {
		return "", fmt.Errorf("claude cli: read output: %w", scanErr)
	}
	if strings.TrimSpace(finalResult) == "" {
		finalResult = transcript.String()
	}
	return strings.TrimSpace(finalResult), nil
}

// RenderPrompt substitutes {{key}} placeholders for the node's declared inputs;
// declared inputs the template never references are appended so they always
// reach the agent.
func RenderPrompt(template string, inputs []string, context map[string]any) string {
	prompt := template
	for _, key := range inputs {
		// Loop-body keys are legitimately absent on the first pass; render
		// them empty rather than "<nil>".
		value := ""
		if raw, ok := context[key]; ok && raw != nil {
			value = fmt.Sprintf("%v", raw)
		}
		placeholder := "{{" + key + "}}"
		if strings.Contains(prompt, placeholder) {
			prompt = strings.ReplaceAll(prompt, placeholder, value)
		} else {
			prompt += "\n\n" + key + ":\n" + value
		}
	}
	return prompt
}
