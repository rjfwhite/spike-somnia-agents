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
COPY *.go ./

# Build static binary
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags='-s -w' -o go-agent-host .

# Production stage
FROM alpine:3.19

WORKDIR /app

# Install Docker CLI
RUN apk add --no-cache docker-cli ca-certificates

# Copy binary from builder
COPY --from=builder /app/go-agent-host .

# Create image-cache directory
RUN mkdir -p image-cache

ENV PORT=80
EXPOSE 80

CMD ["./go-agent-host", "--port=80"]
