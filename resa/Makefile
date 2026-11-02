.DEFAULT_GOAL := app

GO ?= go
GO_CACHE ?= /tmp/resa-go-cache
ARGS ?= list

.PHONY: app build test desktop preview desktop-check install setup setup-tools tools-check

app:
	GOCACHE="$(GO_CACHE)" GOPROXY=off $(GO) run -buildvcs=false ./cmd/resa $(ARGS)

build:
	GOCACHE="$(GO_CACHE)" GOPROXY=off $(GO) build -buildvcs=false -o bin/resa ./cmd/resa

test:
	GOCACHE="$(GO_CACHE)" GOPROXY=off $(GO) test ./...
	PYTHONDONTWRITEBYTECODE=1 /usr/bin/python3 -m unittest discover -s internal/device -p '*_test.py'

install:
	pnpm install --frozen-lockfile --store-dir .pnpm-store

setup: setup-tools install

setup-tools:
	python3 scripts/setup_tools.py

tools-check:
	python3 scripts/setup_tools.py --check

desktop: build
	pnpm desktop

preview:
	pnpm preview

desktop-check:
	pnpm check
