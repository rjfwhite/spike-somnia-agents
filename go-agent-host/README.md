# Agent Runner

HTTP server that runs containerized agents on demand. It downloads container images from URLs, manages their lifecycle, and forwards requests to them.

## Building

```bash
make build
```

This produces `bin/agent-runner`.

## Running

```bash
./bin/agent-runner [flags]
```

### Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--port` | 8080 | HTTP server port |
| `--cache-dir` | ./image-cache | Directory to cache downloaded container images |
| `--start-port` | 10000 | Starting port for container allocation |
| `--runtime` | (empty) | Container runtime (e.g., `runsc` for gVisor) |
| `--api-key` | (empty) | API key for authentication (disabled if empty) |
| `--receipts-url` | (GCP URL) | URL for receipt uploads (empty to disable) |

### Example

```bash
./bin/agent-runner --port 8080 --api-key my-secret-key
```

## API

### Execute Agent

```
POST /
```

**Headers:**
- `X-Agent-Url`: URL of the tarred container image (required)
- `X-Request-Id`: Unique request ID (required)
- `X-API-Key`: API key (if authentication enabled)

**Body:** Binary ABI-encoded function call

**Alternative:** Use query parameters instead:
```
GET /?agentUrl=<url>&requestId=<id>&data=<base64-encoded-body>&apiKey=<key>
```

**Response:** Binary ABI-encoded result from the agent

### Health Check

```
GET /health
```

Returns: `{"status": "healthy", "version": "..."}`

### Version

```
GET /version
```

Returns: `{"version": "...", "gitCommit": "...", "buildTime": "..."}`

## Authentication

When `--api-key` is set, requests to `/` require authentication via one of:
- `X-API-Key` header
- `Authorization: Bearer <key>` header
- `apiKey` query parameter

The `/health` and `/version` endpoints are always public.

## Testing

```bash
make test       # Unit tests
make test-e2e   # End-to-end tests (requires Docker)
```

## Docker

```bash
make docker-build
```
