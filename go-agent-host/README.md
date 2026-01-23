# Go Agent Host

A Go re-implementation of the Agent Host HTTP server for running containerized agents. This version removes all blockchain dependencies and exposes functionality via a simple HTTP server.

## API

### Execute Agent Function

```
POST /
Headers:
  X-Agent-Url: <URL of the tarred container image>
  X-Request-Id: <unique request ID for receipts>
Body: Binary ABI-encoded function call
```

Or via GET with query params:
```
GET /?agentUrl=<url>&requestId=<id>&data=<base64-encoded-body>
```

Returns:
- Body: Binary ABI-encoded result from the agent
- Headers:
  - `X-Receipt-Url`: URL of the execution receipt (if provided by agent)

### Health Check

```
GET /health
```

Returns JSON: `{ "status": "healthy" }`

## How It Works

1. When a request arrives, the host makes a HEAD request to `X-Agent-Url` to get version info
2. The version hash is computed from ETag, Last-Modified, or Content-Length headers
3. If a container is running with the same version hash, it's reused
4. If no container or outdated version, the image is downloaded and a new container started
5. The request is forwarded to the container with the binary ABI body
6. The container's response (status, body, receipt) is proxied back to the requester

## Building

```bash
go build -o go-agent-host .
```

## Running

```bash
./go-agent-host
```

Or with environment variables:
```bash
PORT=8080 ./go-agent-host
```

## Environment Variables

- `PORT`: HTTP server port (default: 8080)
- `RECEIPTS_SERVICE_URL`: URL for receipt uploads (default: GCP Cloud Run service)
- `DOCKER_HOST`: Remote Docker daemon URL (optional, e.g., `tcp://host:2375`)
