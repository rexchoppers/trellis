# Trellis — Design Spec

Date: 2026-07-12
Status: Approved for planning

## Purpose

Trellis is a Rust GUI for building and running human-in-the-loop agent pipelines. It
replaces the Python `agent-pipeline` project. Where `agent-pipeline` guessed a human's
intent from the sentiment of a Linear comment (and got it wrong), Trellis makes every
decision explicit: agents emit machine-readable **codes**, and the human drives each gate
with an explicit keypress. No sentiment classification anywhere.

A pipeline is a **branching flowchart** of agent stages. You draw the boxes, wire the
arrows (each arrow labelled with a code an agent can emit), run a pipeline against a Linear
ticket, and at each stage read the agent's output and choose what happens next.

## Core concepts

- **Pipeline** — a flowchart: nodes (agents) plus code-labelled edges between them. Stored
  as a TOML file.
- **Node** — one agent stage: a prompt template, a working directory, the set of codes it
  may emit, and optional on-accept actions. The pipeline names an `entry` node; a run
  finishes when an edge points at `END` or when a node emits `FAIL`.
- **Code** — a machine-readable label an agent prints as the last line of its output
  (e.g. `::trellis:: FRONTEND_ONLY`). Codes route the flowchart. Two codes are reserved:
  `NEEDS_INPUT` (pause for a human reply) and `FAIL` (halt the run). All other codes are
  user-defined and wired to target nodes.
- **Run** — one execution of a pipeline against an input (a Linear ticket). Append-only
  transcript stored as a JSONL file.
- **Gate** — the human decision at a finished stage: Accept, Deny+feedback, or (when the
  agent asked something) Reply.

## Decisions (locked during brainstorming)

1. **Trellis replaces agent-pipeline** — a careful, full Rust rewrite, not a wrapper.
2. **Executor = shell out to `claude -p`.** A node run spawns the `claude` CLI as a
   subprocess in the node's working directory and captures stdout. Trellis does not make
   model API calls itself; it reuses the tuned `claude` harness (tools, MCP, permissions).
3. **Linear stays as the ticket source.** A run is seeded from a Linear ticket. On accept,
   a node's actions can write back to Linear (set status, add a comment). Linear is
   optional per pipeline.
4. **Pipelines are a branching flowchart** (state machine), not a straight line. The
   agent's emitted code selects the outgoing edge, i.e. which node runs next.
5. **The human never gets second-guessed.** Branch = emitted code (deterministic).
   Accept/Deny = explicit keypress. Unknown/absent code = treated as `NEEDS_INPUT`, never
   guessed.
6. **GUI, built with egui/eframe.** All-Rust immediate-mode GUI; `egui_snarl` (or
   `egui_node_graph2`) for the flowchart canvas. Chosen over Tauri (drags in a web
   frontend) and iced (more ceremony for node editing).
7. **Files, no database.** Pipeline definitions are TOML files in a `pipelines/`
   directory; run transcripts are append-only JSONL files in a `runs/` directory.

## Architecture

Four layers, each independently testable. Business logic never lives in the GUI.

### 1. Engine (pure, no I/O)
The state machine. Inputs: a pipeline definition, a run's current state, an incoming
code. Output: the next node, or "wait for human", or done/failed. Fully unit-tested, the
way `decider.py` is today but branching. No network, no filesystem, no UI.

### 2. Config layer
Parse and write pipeline TOML. Append and replay run JSONL. Serde types shared with the
engine. Round-trips a pipeline file without loss (the canvas editor writes through it).

### 3. Executor
Spawn `claude -p` in a node's working directory, stream stdout/stderr into the run view,
and parse the trailing `::trellis:: <CODE>` line out of the output. Everything above the
code line is the human-readable output. Knows nothing about the GUI.

### 4. GUI (egui)
Three views:
- **Library** — the pipelines in `pipelines/` and past runs in `runs/`.
- **Flowchart editor** — draw nodes, wire code-labelled edges, edit a node's prompt /
  working dir / codes / on-accept actions. Saves to TOML.
- **Run view** — pick a pipeline + a Linear ticket, watch a node execute, read output, and
  press Reply / Accept / Deny. Shows the branch taken. Reloads from a run's JSONL.

The GUI calls engine + executor + config + Linear client; it holds no routing or gate
logic itself.

### Integrations
- **`claude` CLI** — the executor's subprocess.
- **Linear** — a thin `reqwest` GraphQL client (same shape as the Python `linear.py`):
  read a ticket to seed a run; write status/comment via on-accept actions. Key + team from
  config/env.

## Run loop and gate semantics

1. Pick a pipeline and pull a Linear ticket. A new run starts at START.
2. Trellis runs the current node: fill the prompt template (`{ticket}`, `{input}` = the
   previous node's accepted output), spawn `claude -p` in the node's working dir, stream
   output into the run view.
3. On each agent turn, parse the trailing code:
   - `NEEDS_INPUT` — pause; the human types a reply; the same conversation continues
     (multi-turn within the node).
   - `FAIL` — halt the run in a failed state.
   - any user-defined code — a finished result. Show it and wait for the human gate:
     - **Accept** — the node's on-accept actions fire; the engine follows the edge labelled
       with that code to the next node.
     - **Deny + feedback** — the node re-runs as a new attempt with the human's feedback
       appended to the conversation.
4. Repeat until END (done) or FAIL. Every event is appended to the run's JSONL.

**Auto-accept** — a node can be flagged auto-accept so a clean result flows straight to
the next node without stopping the human. The human is only pulled in on `NEEDS_INPUT` or
at nodes not marked auto-accept. This is the "don't badger me" behaviour, still with zero
guessing (a clean result is a specific emitted code, not a sentiment judgement).

## The code convention

- An agent prints one machine-readable line as the **last line** of its output:
  `::trellis:: <CODE>`.
- Everything above that line is the human-readable output rendered in the run view.
- A node declares its **valid codes** in its TOML. If the agent emits an unknown code or
  no code line at all, Trellis treats the turn as `NEEDS_INPUT` and asks the human. It
  never guesses a branch.
- Agent prompts are authored to end with the correct `::trellis::` code for each outcome
  (this is prompt-tuning work the user owns per agent).

## File formats

### Pipeline (`pipelines/<name>.toml`)
```toml
name = "trakkt-ticket"
description = "Ticket to merged feature"
entry = "nane"          # the node the run enters after START

[[node]]
id = "nane"
name = "NAN-E (breakdown)"
prompt = "You are NAN-E... Ticket: {ticket}\nPrevious: {input}"
working_dir = "~/trakkt-pipeline"
codes = ["NEEDS_BACKEND", "FRONTEND_ONLY"]
auto_accept = false

  [[node.action]]      # fires on accept
  type = "linear_set_status"
  status = "WALL-E · Working"

[[edge]]
from = "nane"
code = "NEEDS_BACKEND"
to = "walle"

[[edge]]
from = "nane"
code = "FRONTEND_ONLY"
to = "vngo"
```
START and END are not nodes. The run enters at the top-level `entry` node id. An edge
whose `to = "END"` finishes the run successfully. The reserved `FAIL` code finishes it in
a failed state.

### Run transcript (`runs/<run-id>.jsonl`)
One JSON event per line, append-only. Event kinds:
- `run_started` — pipeline, input ticket ref + snapshot, timestamp.
- `node_started` — node id, attempt number, the full prompt sent.
- `agent_output` — raw output, parsed code.
- `human_reply` — the human's reply text (answers a `NEEDS_INPUT`).
- `gate` — decision (`accept` / `deny`), feedback text.
- `action_fired` — action type + result (e.g. Linear status set).
- `branch` — edge taken (from, code, to).
- `run_finished` — `done` or `failed`.

A run is fully reconstructable from its JSONL: every agent turn, every human reply, every
gate decision, and every branch is on the record.

## Build order

Each step is independently usable and testable.

1. **Engine crate** — pure state machine + code routing, unit-tested. No UI.
2. **Config layer** — pipeline TOML parse/write, run JSONL append/replay.
3. **Executor** — spawn `claude -p`, stream, parse `::trellis::` code.
4. **GUI run view** — load an existing TOML pipeline, run it against a ticket, gate it.
   This is the daily-value core.
5. **GUI flowchart editor** — draw/wire/save nodes to TOML. Last, because hand-written
   TOML unblocks everything before it.
6. **Linear client** — read a ticket to seed a run; write status/comment on accept.

## Out of scope (v1)

- Making model API calls directly from Rust (executor is `claude -p` only).
- Non-agent node types beyond START/END (e.g. pure human-decision nodes) — possible later.
- Parallel/concurrent node execution within one run (v1 is one active node at a time).
- Any database. Files only.
- Migrating existing `agent-pipeline` run history.

## Prerequisite

The Rust toolchain (`cargo`) is not currently on the user's PATH; it must be installed
before the build starts.
