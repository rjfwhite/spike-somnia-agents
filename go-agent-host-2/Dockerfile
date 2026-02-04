# Build stage
FROM golang:1.24-alpine AS builder

WORKDIR /app

# Install git for go mod download
RUN apk add --no-cache git

# Copy go mod files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source
COPY cmd/ cmd/
COPY internal/ internal/

# Build args for version info
ARG VERSION=dev
ARG GIT_COMMIT=unknown
ARG BUILD_TIME=unknown

# Build static binary with version info
RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-s -w \
        -X github.com/somnia-chain/agent-runner/internal/config.Version=${VERSION} \
        -X github.com/somnia-chain/agent-runner/internal/config.GitCommit=${GIT_COMMIT} \
        -X github.com/somnia-chain/agent-runner/internal/config.BuildTime=${BUILD_TIME}" \
    -o agent-runner ./cmd/agent-runner

# Production stage
FROM alpine:3.19

WORKDIR /app

# Install Docker CLI
RUN apk add --no-cache docker-cli ca-certificates

# Copy binary from builder
COPY --from=builder /app/agent-runner .

# Create image-cache directory
RUN mkdir -p image-cache

ENV PORT=80
EXPOSE 80

CMD ["./agent-runner", "--port=80"]
