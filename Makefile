.PHONY: deps dev build bindings check

WAILS := $(shell go env GOPATH)/bin/wails

deps:
	go install github.com/wailsapp/wails/v2/cmd/wails@v2.16.0
	go mod download
	pnpm --dir frontend install

dev:
	$(WAILS) dev

build:
	$(WAILS) build -clean

bindings:
	$(WAILS) generate module

check:
	go vet ./...
	pnpm --dir frontend exec tsc --noEmit
