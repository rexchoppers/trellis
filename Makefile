.PHONY: deps ui test build dev

deps:
	go mod download
	pnpm --dir web install

ui:
	pnpm --dir web build
	touch web/dist/.placeholder

test:
	go test ./...

build: ui
	go build -o bin/trellis .

dev: ui
	go run .
