# Agent file reference

## Where things live

```
.trellis/
  trellis.yaml                         name; mcp: nickname -> MCP server name from the user's Claude Code config
  departments/<team>/department.yaml   name, colour ('#rrggbb'), order
  departments/<team>/agents/<agent>.md one agent; the file name is its key
  places/<place>.yaml                  name, kind (kitchen), order
  npcs/<npc>.yaml                      name, colour, place, does (serve, sit or patrol), carries, lines
```

An agent's key is `<team>/<agent>`, from the folder and file names. `delegates` and other references use it.

## Front matter

| Field | Value | Notes |
|---|---|---|
| `name` | Display name | Shown on the floor, the desk nameplate and in the Flow tab |
| `task` | One line | What the agent does. Shown on its card |
| `desks` | Number, or `any` | Jobs it can run at once. `any` takes a desk per running job |
| `order` | Number | Order within the team |
| `model` | Claude model alias, e.g. `sonnet`, `haiku` | Optional. A cheap model suits frequent, short checks |
| `instructions` | Path to a file | Its body is used before this file's own body; its front matter is ignored. For reusing an existing `.claude/agents/*.md` |
| `worktree` | `true` | Each job gets its own git worktree of the repo |
| `branches` | `own` | With `worktree`: the agent makes its own branches and PRs. Without it, Trellis pushes a branch and opens the PR when the human marks the job done |
| `permissions.free` | List of tools | Run without asking |
| `permissions.ask` | List of tools | Wait for the human to allow or deny each call |
| `steps` | List | Names, or `{name, tools}`. Tools on a step only work while that step is active. `finish` only works once every step is done or skipped |
| `outcomes` | List | How a job can end (below) |
| `listens` | List of `{event, when}` | Events that start a job for this agent. `when` maps keys to required values in the event's data |
| `delegates` | List of `team/agent` | Agents this one may start jobs for and message |
| `every` | Duration, at least `1m` | Rest between checks and wake on this timer, and early when a delegated job checks in, finishes or fails |

Any tool not in `free` or `ask` is refused, and the agent has to tell the human it needs it.

### Tools in permissions

- Claude Code tools by name: `Read`, `Grep`, `Glob`, `Edit`, `Write`, `WebSearch`, `WebFetch`, `Bash`.
- Narrowed with a pattern: `Bash(git diff*)`, `Bash(gh pr create*)`.
- MCP tools by the project's nickname: `linear/list_*`, `linear/save_issue`.
- Put `git push`, `gh pr create`, merges, deploys, deletes and anything that messages people in `ask` unless the user wants otherwise.

### Outcomes

| Field | Notes |
|---|---|
| `name` | snake_case, what the agent passes to finish |
| `label` | Shown to the human |
| `fields` | `key: description`. What the agent must report in its data (links, identifiers), passed on to whoever picks it up |
| `publish` | Event name sent when the job ends this way, e.g. `design.done`. Starts a job for every agent whose `listens` matches |
| `with` | Fixed data added to the event, for listeners' `when` filters, e.g. `route: epic` |
| `back` | `true`: return the work to the agent that handed this job over, in their original job |
| `confirm` | `true`: the agent only proposes this outcome; the human finishes the job |

A listener matches when its `event` equals the outcome's `publish` and every `when` key equals the outcome's `with` value. A `when` key the outcome has no `with` for only maybe matches (the Flow tab draws it dashed).

## What Trellis already tells every agent

Trellis adds its own system prompt to every job, so an agent file never repeats it:

- Talk to the human through Trellis. Stop only when finished or when something is needed, and call `check_in` with a summary first. Never check in just to report progress.
- Write for a fast reader: result first, short lines, bullets, no preamble or pleasantries.
- Report progress with the `step` tool: active when starting, done with a one-line note, or skipped.
- End with `finish`, giving an outcome and its data fields. `publish` resends a missed hand-off without ending the job.
- `fresh_session` starts a clean session in the same job, with a handover, between independent pieces of work.
- With `delegates`: start jobs with `delegate`, talk to them with `message`. Trellis reports when they check in, finish or fail.
- With `every`: end each check with `rest`.
- Worktree rules: own branches from `origin/<name>`, commit and push before finishing; or, with a branch from Trellis, commit only and let Trellis push and open the PR.
- Who started the job (a lead agent or a hand-off), and the event's data in the first message.

The body covers what only this agent knows: its scope, what each kind of task means, its process and gates, and how it reports.
