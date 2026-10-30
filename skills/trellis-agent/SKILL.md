---
name: trellis-agent
description: Create or change a Trellis agent, the Markdown file at .trellis/departments/<team>/agents/<name>.md that Trellis runs as a Claude Code job. Asks what the agent does, fits it into the project's teams and hand-offs, writes the file in Trellis's house shape and checks its wiring. Use when someone wants a new Trellis agent, a new department, or a hand-off between agents.
---

# Trellis agent

A Trellis agent is one Markdown file: YAML front matter that Trellis reads (tools, steps, outcomes, triggers) and a body that becomes the agent's prompt. This skill writes one that fits the project it lives in.

Read `reference.md` (every front matter field, and what Trellis already tells every agent) and `template.md` (the body shape) in this folder before writing anything.

## 1. Read the project

1. Find `.trellis/` at the project root. Missing: offer to create `.trellis/trellis.yaml` with `name: <project name>` and stop until they agree.
2. List departments (`.trellis/departments/*/department.yaml`) and every agent's front matter. Note:
   - events already published (`outcomes[].publish`, with their `with` data) and listened for (`listens[].event`, `when`)
   - agents that delegate or run on a timer
   - MCP nicknames in `trellis.yaml` (`mcp:`), which agents use in permissions as `nickname/tool`
3. Read two or three existing agent bodies. Match their voice, headings and length. With no agents yet, use `template.md` as it is.
4. Look for generated blocks in existing agent bodies (for example `<!-- BEGIN CONVENTIONS ... -->`). If there are any, find the script that writes them and note how an agent gets registered with it.

## 2. Find out what the agent is for

Ask only what the project and the request don't already answer, one or two questions at a time. Offer a default the user can accept.

| Question | Decides |
|---|---|
| What is its job, in one line? | `name`, `task`, the body's opening line |
| Which team is it in? | the department folder, or a new one |
| Who starts it: you, another agent finishing, a lead agent, or a timer? | `listens`, being in another agent's `delegates`, `every` |
| Does it wait for your decisions, or run to the end on its own? | Consent rule or Run rule, and where the check-ins go |
| What may it change: nothing, a tracker, docs, code? | `permissions`, `worktree`, `branches`, Hard scope |
| What ends the job, and who picks it up next? | `outcomes`, `publish`, `back`, `confirm`, `fields` |
| How many can run at once? | `desks` |

Then play it back in a few lines: name, team, trigger, the steps, the outcomes and where each goes, what it may change, and what it asks before doing. Write nothing until the user agrees.

## 3. Write it

1. Front matter, by `reference.md`:
   - Least privilege. Reading tools in `free`. Anything that publishes, pushes, merges, deploys, deletes or messages people in `ask`, unless the user says otherwise.
   - Tools that write only during one step go on that step's `tools`.
   - `steps` named exactly like the body's step headings.
   - Each outcome gets `fields` for what the next agent or the human needs (links, identifiers), not prose.
   - Quote any value containing `: `.
2. Body, by `template.md`:
   - What only this agent knows: its scope, what each kind of task means, its process, its gates and how it reports.
   - Never repeat what Trellis already tells every agent (see `reference.md`): how to check in, report steps, finish, rest, delegate, or work in a worktree.
   - Compressed and direct: short imperative lines, no filler, one fact per bullet.
3. New department: `department.yaml` with `name`, a `colour` not used by another team, and `order` after the last one.
4. Generated blocks: register the agent the way the project's script expects, run the script, and check its output.

## 4. Wire it in

- An outcome that publishes an event needs a listener. Point it at an existing listener, or add `listens` to the agent that should pick it up. Ask before editing another agent.
- A `listens` entry needs a sender with a matching `with`. Every key in `when` must equal that outcome's `with` value.
- `back: true` returns the work to whichever agent handed this one its job. It only makes sense for an agent that listens for something.
- `delegates` entries are `department/agent` keys (folder names) that exist.

## 5. Check before handing over

- The front matter parses as YAML.
- Every `steps` name has a `## Step N: <name>` heading, in the same order.
- The Flow tab would show no problems for it:
  - every `publish` reaches a listener
  - every `listens` has a sender
  - every `delegates` target exists
- `every` is at least `1m`, and `desks` is a number or `any`.

Tell the user the file path, how to start the agent in Trellis (open its department, start a job, give it a task such as "go"), and where its outcomes go.
