# Trellis

Welcome to the 47th floor.

Congratulations on your promotion. You are now the manager to a team of agents who are thrilled to be here. Your job is now to micromanage, hold standups, and make sure that your team is working hard.

Make no mistakes.

<p>
  <img src="docs/images/office.gif" alt="Agents at work on the 47th floor" width="49%">
  <img src="docs/images/first-person.gif" alt="Walking the floor from your desk" width="49%">
</p>

## What is Trellis

Trellis is an application that runs a team of Claude Code agents as an office you can walk around.

You set the team up once, then hand it work. Trellis runs each agent's jobs on your codebase, passes results from one agent to the next, and stops to ask you whenever a decision or a risky action needs a human.

With it you can:

- **Build a team.** An agent for each part of your process (research, specs, design, building, review, release), each with its own instructions, tools and limits.
- **Run a pipeline.** Chain agents so one finishing starts the next, from an idea to a reviewed PR.
- **Work in parallel.** Many jobs at once, each in its own git worktree with its own branch and PR.
- **Stay in charge.** Allow tools, answer check-ins, sign off results and send PR review comments back, all in one place.
- **See everything.** Follow any job live, see the whole pipeline in the Flow tab, or walk the floor.

## Getting started

Download the latest build from [Releases](https://github.com/rexchoppers/trellis/releases). Trellis needs [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed and logged in, plus `git` and `gh`.

> [!NOTE]
> Trellis isn't signed yet, so macOS will warn you the first time you open it. Right-click the app and choose **Open**, or run `xattr -cr /Applications/Trellis.app`.

## Your first agent

Let Claude write it. Install the Trellis plugin in Claude Code:

```
/plugin install trellis --marketplace rexchoppers/trellis
```

On older Claude Code, run `/plugin marketplace add rexchoppers/trellis`, then `/plugin install trellis@trellis`.

Then ask for one, for example "make a Trellis agent that reviews PRs". It reads your `.trellis/`, asks what it needs to know, and writes the agent so it fits your teams and hand-offs.

Agents live in your project under `.trellis/`:

```
.trellis/
  trellis.yaml                          name, and the MCP servers agents may use
  departments/
    qa/
      department.yaml                   name, colour, order
      agents/
        quinn.md                        one agent
  places/kitchen.yaml                   somewhere for people to be
  npcs/brian.yaml                       the regulars
```

An agent is front matter for Trellis and a prompt for Claude:

```markdown
---
name: Quinn
task: Checks every PR and sends it back when it needs changes
desks: 2
permissions:
    free:
        - Read
        - Grep
        - Bash(git diff*)
    ask:
        - Bash(gh pr review*)
listens:
    - event: build.done
outcomes:
    - name: approved
      label: Approved
      publish: review.passed
    - name: changes
      label: Changes needed
      back: true
---

You are **Quinn**, the QA agent. Read the PR against its ticket and list what is missing or wrong.
```

`free` tools run straight away, `ask` tools wait for you to allow them, and anything else is refused. `build.done` from another agent starts Quinn's job; **Approved** hands the PR on, **Changes needed** sends it back to whoever built it.

### Agent file reference

| Field | What it does |
|---|---|
| `name`, `task` | Who they are and what they do, shown on the floor and in the Flow tab |
| `desks` | How many jobs can run at once (`any` for one per job) |
| `permissions` | `free` and `ask` lists of Claude Code tools, MCP tools as `server/tool` |
| `worktree`, `branches` | Run each job in its own git worktree; `own` lets the agent make its own branches and PRs |
| `steps` | Progress steps shown on the job; tools listed on a step only work during it |
| `outcomes` | How a job can end. `publish` sends an event, `with` adds fixed data, `back` returns work to the sender, `confirm` leaves the final call to you, `fields` is what the agent must report |
| `listens` | Events that start a job, with optional `when` filters on the event's data |
| `delegates` | Agents this one may start jobs for, like a project manager handing out tickets |
| `every` | Wake on a timer (for example `10m`) and check again |
| `model` | Claude model for this agent |
| `instructions` | Use another file's body as the prompt, for example an existing `.claude/agents` file |
