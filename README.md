# Trellis

Local single-binary tool for running multi-agent Claude Code pipelines with human checkpoints. Solo use, localhost, no auth.

## Build and run

```
make deps    # go + pnpm deps
make build   # frontend + bin/trellis
```

```
cd ~/some/project
~/Projects/trellis/bin/trellis
```

Opens a browser on a free localhost port. State lives in `trellis-data/` as JSON files.

Flags: `-data path`, `-port n`, `-no-browser`, `-workdir /path`.

## Linear runs

Put `LINEAR_API_KEY=...` in a `.env` where you launch trellis, or export it. Pick a pipeline, enter a `TRA-123` id or issue URL, and Run.
