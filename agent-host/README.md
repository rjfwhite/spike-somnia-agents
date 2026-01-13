# Agent Host HTTP

A simplified HTTP-only agent host for running containerized agents. This version removes all blockchain dependencies and exposes functionality via a simple HTTP server.

## API

### Execute Agent Function

```
POST /
Headers:
  X-Agent-Url: <URL of the tarred container image>
  X-Request-Id: <unique request ID for receipts>
Body: Binary ABI-encoded function call
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

1. When a POST request arrives, the host makes a HEAD request to `X-Agent-Url` to get version info
2. The version hash is computed from ETag, Last-Modified, or Content-Length headers
3. If a container is running with the same version hash, it's reused
4. If no container or outdated version, the image is downloaded and a new container started
5. The request is forwarded to the container with the binary ABI body
6. The container's response (status, body, receipt URL) is proxied back to the requester

## Running Locally

```bash
npm install
npm run dev
```

## Building

```bash
npm run build
npm start
```

## Docker

```bash
docker build -t agent-host-http .
docker run -p 8080:8080 -v /var/run/docker.sock:/var/run/docker.sock agent-host-http
```

Note: The container needs access to the Docker socket to manage agent containers.

## Deploying to GCP

```bash
cd deploy/gcp
./setup.sh
```

This will:
1. Enable required GCP APIs
2. Create Artifact Registry repository
3. Create service account with deploy permissions
4. Generate key for GitHub Actions
5. Create GCE VM with Docker socket mounted

## Environment Variables

- `PORT`: HTTP server port (default: 8080)
