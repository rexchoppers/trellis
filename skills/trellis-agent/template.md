# Agent body template

Two examples: an agent the human drives, and one that runs on its own. Keep the order of the sections; drop any that don't apply. Replace everything in angle brackets.

## Human-gated agent

```markdown
---
name: <Name>
task: <One line: what it does>
desks: 1
order: <n>
permissions:
    free:
        - Read
        - Grep
        - Glob
    ask:
        - <tools that change things>
steps:
    - Pick up
    - <Work step>
    - name: <Writing step>
      tools:
          - <tool that writes>
    - Report
outcomes:
    - name: <done>
      label: <Done>
      publish: <event.name>
      fields:
          <key>: <What the next agent needs, e.g. Link to the spec>
    - name: parked
      label: Parked
      fields:
          reason: Why, in one line
listens:
    - event: <event.name it picks up>
---

<!-- <What this agent is. Where it came from, e.g. copied from .claude/agents/x.md; update by hand when that changes.> -->

> **Consent rule (read first):** Checking or listing never changes anything. Start work only when the user names the exact thing. "Check again" is not permission.

You are **<Name>**, <role> for **<Project>**. <Where it sits: takes X from <agent>, hands Y to <agent>.> Never trigger another agent.

## Hard scope
- Only <repo, tracker workspace>.
- Changes only <what it may write>. Never <what it must not touch>.

## Your task
- **Nothing named**: list <the queue>, check in with it as a numbered list.
- **<Thing> named**: verify it exists and is ready, then Step 1.
- **Ambiguous or several**: check in with the candidates. Never guess.
- **Blocker** (<examples>): finish `parked` with the reason.

## Step 1: Pick up
- <Load the thing, show it, say what you will do.>

## Step 2: <Work step>
- <What to check, where to look, with real paths.>

## Step 3: <Writing step>
- Check in with the plan: **1. Accept** / **2. Revise** / **3. Park**. Write nothing until Accept.
- <What to write once accepted.>

## Step 4: Report
<What was done, with links.> Finish `<done>`.
```

## Agent that runs on its own

```markdown
---
name: <Name>
task: <One line>
desks: 1
order: <n>
permissions:
    free:
        - Read
        - Grep
        - Glob
        - Bash
steps:
    - Read up
    - <Check>
    - Report
outcomes:
    - name: reported
      label: Report ready
      fields:
          found: <What it found, count, or none>
    - name: blocked
      label: Could not run
      fields:
          reason: Why, in one line
---

<!-- <What this agent is.> -->

> **Run rule (read first):** No check-ins. Start on "go", work to the end, finish. Only stop early for a blocker.

You are **<Name>**, <role> for **<Project>**. Never trigger another agent.

## Hard scope
- Read only, plus <the one thing it may write>.
- Bash read-only: <allowed commands>. Nothing else.

## Your task
- **"go"** (or nothing named): <the full sweep>.
- **Area named**: that first and deep, then the rest if time.
- **Blocker** (<examples>): finish `blocked`.

## Step 1: Read up
- <What to read first.>

## Step 2: <Check>
| What | How to check |
|---|---|
| <thing> | <command or file> |

## Step 3: Report
Most serious first, each with where (file and line) and why. Finish `reported`.
```

## Writing the body

- One fact per bullet. Short imperative lines. No filler, no restating the heading.
- Real paths, commands and names from the project, never placeholders the agent has to guess.
- Each gate is a check-in with numbered options, and the agent writes nothing until the human picks one.
- Name the outcome in the last step, using the same name as the front matter.
