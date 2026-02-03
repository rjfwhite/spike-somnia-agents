.PHONY: build run test clean docker-build

VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
GIT_COMMIT ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BUILD_TIME ?= $(shell date -u '+%Y-%m-%dT%H:%M:%SZ')

LDFLAGS := -ldflags "-s -w \
	-X github.com/somnia-chain/agent-runner/internal/config.Version=$(VERSION) \
	-X github.com/somnia-chain/agent-runner/internal/config.GitCommit=$(GIT_COMMIT) \
	-X github.com/somnia-chain/agent-runner/internal/config.BuildTime=$(BUILD_TIME)"

LDFLAGS_COMMITTEE := -ldflags "-s -w \
	-X main.Version=$(VERSION) \
	-X main.GitCommit=$(GIT_COMMIT) \
	-X main.BuildTime=$(BUILD_TIME)"

build:
	go build $(LDFLAGS) -o bin/agent-runner ./cmd/agent-runner
	go build $(LDFLAGS_COMMITTEE) -o bin/committee-member ./cmd/committee-member

run: build
	./bin/agent-runner

test:
	go test -v ./...

test-e2e:
	go test -v -tags=e2e ./test/...

clean:
	rm -rf bin/
	rm -rf image-cache/

docker-build:
	docker build \
		--build-arg VERSION=$(VERSION) \
		--build-arg GIT_COMMIT=$(GIT_COMMIT) \
		--build-arg BUILD_TIME=$(BUILD_TIME) \
		-t agent-runner:$(VERSION) .

fmt:
	go fmt ./...

lint:
	go vet ./...
