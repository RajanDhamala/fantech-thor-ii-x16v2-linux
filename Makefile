.PHONY: help build test check audit
.PHONY: resa-install resa-build resa-test resa-check resa-run resa-preview resa-cli
.PHONY: screendrop-deps screendrop-install screendrop-assets screendrop-build screendrop-run screendrop-test screendrop-check

help:
	@echo "make resa-install / resa-run / resa-preview / resa-cli"
	@echo "make screendrop-deps / screendrop-run"
	@echo "make screendrop-install / screendrop-assets"
	@echo "make build / test / check / audit"

build: resa-build screendrop-build

test: resa-test screendrop-test

check: resa-check screendrop-check audit

audit:
	python3 -m unittest discover -s scripts -p 'test_*.py'
	python3 scripts/audit-publication.py

resa-install:
	$(MAKE) -C resa install

resa-build:
	$(MAKE) -C resa build

resa-test:
	$(MAKE) -C resa test

resa-check: resa-test
	cd resa && npm run check
	cd resa && go vet ./...
	cd resa && python3 -m unittest discover -s scripts -p test_setup_tools.py

resa-run:
	$(MAKE) -C resa desktop

resa-preview:
	$(MAKE) -C resa preview

resa-cli:
	$(MAKE) -C resa app

screendrop-deps:
	cd api && go mod download

screendrop-install:
	cd api && npm ci

screendrop-assets:
	cd api && npm run build

screendrop-build:
	cd api && go build -buildvcs=false -o bin/screendrop .

screendrop-run:
	cd api && LISTEN_ADDR="$${LISTEN_ADDR:-127.0.0.1:3030}" go run -buildvcs=false .

screendrop-test:
	cd api && go test ./...
	cd api && python3 -m unittest discover -s scripts -p '*_test.py'

screendrop-check: screendrop-test
	cd api && go vet ./...
