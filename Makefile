.PHONY: deps dev build bindings check models previews blender

WAILS := $(shell go env GOPATH)/bin/wails
BLENDER ?= $(or $(shell command -v blender 2>/dev/null),$(wildcard /Applications/Blender.app/Contents/MacOS/Blender),$(wildcard $(HOME)/Applications/Blender.app/Contents/MacOS/Blender))

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

models: blender
	$(BLENDER) -b --factory-startup --python assets/scenes/corporate-office/city.py
	$(BLENDER) -b --factory-startup --python assets/scenes/corporate-office/office.py
	$(BLENDER) -b --factory-startup --python assets/scenes/corporate-office/surfaces.py

previews: blender
	$(BLENDER) -b --factory-startup --python assets/scenes/corporate-office/city.py -- --preview
	$(BLENDER) -b --factory-startup --python assets/scenes/corporate-office/office.py -- --preview

blender:
	@test -n "$(BLENDER)" || { echo "Blender not found. Install it from blender.org, or run: make models BLENDER=/path/to/blender"; exit 1; }
