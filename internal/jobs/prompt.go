package jobs

import (
	"fmt"
	"slices"
	"sort"
	"strings"

	"github.com/rexchoppers/trellis/internal/config"
	"github.com/rexchoppers/trellis/internal/gate"
)

func args(job Job, d config.Department, agent config.Agent, mcpConfig string) []string {
	// Built-in rules go straight to Claude Code; MCP rules by nickname (linear/*) are decided by Trellis's permission tool.
	var allowed []string
	for _, tool := range gate.All {
		if tool.Name != gate.Permission {
			allowed = append(allowed, "mcp__trellis__"+tool.Name)
		}
	}
	for _, rule := range agent.Permissions.Free {
		// A tool a step owns must always reach Trellis, so it can check the step.
		if !strings.Contains(strings.SplitN(rule, "(", 2)[0], "/") && !strings.Contains(rule, "*") && !agent.StepTool(rule) {
			allowed = append(allowed, rule)
		}
	}
	stopping := "- Stop only when the job is finished or you need something from the human. Never stop or check in just to report progress: a check-in ends your turn and waits on them; report progress with step notes instead. When you do stop, first call check_in with a summary: what you did, what you found, and what you need from them. Never end a turn without it."
	if agent.Every != "" {
		stopping = "- End every check by calling rest. Call check_in only when the human must step in."
	}
	system := strings.TrimSpace(agent.Prompt) + fmt.Sprintf(`

## Working in Trellis
You are %s in the %s department. You and the human talk through Trellis; they can message you at any time.
%s
- Some actions wait for the human's agreement before they run. That is normal: carry on once allowed, and adapt if they say no.
- If a tool is refused as not allowed, tell the human in check_in what you need and why.
- How you write, every message and check-in: the human reads fast. Lead with the result or the one thing you need from them; no preamble, no recap, no pleasantries, no hedging. Keep it to a few short lines. Use bullets over paragraphs, at most 5 per list, and a numbered list for steps, one action each. Say where the job is ("Step 2 of 4 done"). End with the one decision or reply you need, if any. Put long evidence (file lists, sources) under a "Details" heading after the short version.
- Never ask in plain text whether to proceed. The human replies with feedback, marks the job done, or cancels it; only they finish the job.`, agent.Name, d.Name, stopping)
	if len(agent.Steps) > 0 {
		system += "\n\n## Your steps\nReport each with the step tool: status active as you start it, done when finished (with a one-line note), skipped if it does not apply. Steps:"
		for i, step := range agent.Steps {
			system += fmt.Sprintf("\n%d. %s", i+1, step.Name)
			if len(step.Tools) > 0 {
				system += fmt.Sprintf(" (only here: %s)", strings.Join(step.Tools, ", "))
			}
		}
		system += "\nTools listed against a step only work while that step is active, and finish only works once every step is done or skipped."
	}
	if len(agent.Outcomes) > 0 {
		system += "\n\n## How your job ends\nWhen the job is finished, call finish with outcome set to how it ended, one of:"
		for _, outcome := range agent.Outcomes {
			note := ""
			if outcome.Confirm {
				note = " (needs the human: finish only proposes it)"
			}
			if outcome.Back && job.From != nil {
				note += fmt.Sprintf(" (sends the work back to %s, who picks it up again in their original job)", job.From.Agent)
			}
			system += fmt.Sprintf("\n- %s: %s%s", outcome.Name, outcome.Label, note)
			names := make([]string, 0, len(outcome.Fields))
			for name := range outcome.Fields {
				names = append(names, name)
			}
			slices.Sort(names)
			for _, name := range names {
				system += fmt.Sprintf("\n  - data.%s: %s", name, outcome.Fields[name])
			}
		}
		system += "\nPut the details the next person needs in data, as short text fields: names, identifiers, links (e.g. issue, epic, url). Finishing ends your job, and Trellis passes your data on to whoever picks it up. Only finish when the job is truly done; while you still need the human, use check_in. If earlier work's hand-off was missed, or the human asks you to send it again, check the work is really in that state, then call publish with the outcome and its data; that sends the event without ending this job."
	}
	system += "\n- When you finish one independent piece of a larger job (a ticket, a document) and the next piece does not need what is in your context, call fresh_session with a handover: what is done (with links), what is next, anything blocked. A fresh session starts in this same job with your task and the handover."
	if len(agent.Delegates) > 0 {
		system += fmt.Sprintf(`

## Delegating
You may start jobs for: %s. Call delegate with the agent and a full task; message a job you started with its id.
Trellis tells you, in a message, whenever one of your jobs checks in, finishes or fails.`, strings.Join(agent.Delegates, ", "))
	}
	if agent.Every != "" {
		system += fmt.Sprintf(`

## Resting between checks
End every check with rest and a one-line note of where things stand. Trellis wakes you every %s, and straight away when one of your jobs checks in, finishes or fails, with a brief of all your jobs.`, agent.Interval())
	}
	if job.Parent != nil {
		system += fmt.Sprintf("\n- This job was started by %s, who coordinates the work and hears when you check in or finish.", job.Parent.Name)
	}
	if job.From != nil {
		system += fmt.Sprintf("\n- This job was handed to you by %s, who finished their work with the event %s. Its details are in your first message.", job.From.Agent, job.From.Event)
	}
	if job.Worktree != "" && job.Branch == "" {
		system += "\n- You are working in your own git worktree, a fresh checkout on no branch, shared with nobody. Make your own branches, push them and open your own PRs as your instructions say. Other jobs have worktrees of the same repo, so branch from origin/<name> rather than checking out a shared branch such as an integration branch locally. Commit and push before you finish: Trellis removes the worktree when the job ends, keeping it only if it has uncommitted changes."
	}
	if job.Branch != "" {
		system += fmt.Sprintf("\n- You are working in your own git worktree on branch %s. Commit your work as you go. When the human marks the job done, Trellis pushes the branch and opens a PR; do not push or open one yourself.", job.Branch)
	}
	out := []string{"-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose",
		"--permission-prompt-tool", "mcp__trellis__" + gate.Permission,
		"--strict-mcp-config", "--mcp-config", mcpConfig,
		"--allowedTools", strings.Join(allowed, ","),
		// A clean slate: no memories and none of your own hooks, so the agent follows its file and the repo only.
		"--settings", `{"autoMemoryEnabled":false,"disableAllHooks":true,"showThinkingSummaries":true}`,
		// No user/project/local settings: their allow rules would bypass Trellis and their plugins add skills.
		"--setting-sources", "",
		"--append-system-prompt", system}
	if off := agent.Off(); len(off) > 0 {
		out = append(out, "--disallowedTools", strings.Join(off, ","))
	}
	if agent.Model != "" {
		out = append(out, "--model", agent.Model)
	}
	if job.Started {
		return append(out, "--resume", job.Session)
	}
	return append(out, "--session-id", job.Session)
}

func dataLines(data map[string]string) string {
	keys := make([]string, 0, len(data))
	for key := range data {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	var b strings.Builder
	for _, key := range keys {
		fmt.Fprintf(&b, "\n- %s: %s", key, data[key])
	}
	return b.String()
}

func sentBack(from string, outcome config.Outcome, data map[string]string) string {
	return fmt.Sprintf("%s checked your work and sent it back (%s).\n%s\n\nThis is your same job and session: pick your own work up again from here, and finish it again when it is done.", from, outcome.Label, dataLines(data))
}

func handoff(event Event) string {
	return fmt.Sprintf("%s finished their job with %s and handed it to you.\n%s\n\nPick it up from here.", event.From.Agent, event.Name, dataLines(event.Data))
}

func (m *Manager) brief(root string, job Job, news string) string {
	var b strings.Builder
	fmt.Fprintf(&b, "Time for a check.\n- Your task: %s\n", shorten(job.Task, 800))
	if len(job.Children) == 0 {
		b.WriteString("- Your jobs: none yet\n")
	} else {
		b.WriteString("- Your jobs:\n")
		for _, c := range job.Children {
			child, err := Load(root, c.Job)
			if err != nil {
				continue
			}
			state := child.State
			if child.Outcome != "" && child.State == Done {
				state += ", " + child.Outcome
			}
			fmt.Fprintf(&b, "  - %s %s (%s): %s\n", c.Name, c.Job, state, shorten(child.Task, 160))
		}
	}
	handover := job.Handover
	if handover == "" {
		handover = "none: this is your first check"
	}
	fmt.Fprintf(&b, "- Your note from last time: %s\n", handover)
	if news != "" {
		fmt.Fprintf(&b, "\nWhat woke you: %s\n", news)
	}
	b.WriteString("\nDo what the work needs now, then call rest with a one-line note of where things stand.")
	return b.String()
}
