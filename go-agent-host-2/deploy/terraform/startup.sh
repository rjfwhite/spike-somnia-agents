#!/bin/bash
# Startup script for committee VMs
# Runs on Container-Optimized OS (COS)

set -e

METADATA_URL="http://metadata.google.internal/computeMetadata/v1"
METADATA_HEADER="Metadata-Flavor: Google"

log() {
  echo "[startup] $(date '+%Y-%m-%d %H:%M:%S') $1"
}

# Get instance metadata (returns empty on 404)
get_metadata() {
  curl -sf -H "$METADATA_HEADER" "$METADATA_URL/$1" 2>/dev/null || echo ""
}

log "Starting committee member setup..."

# Get instance name
INSTANCE_NAME=$(get_metadata "instance/name")
log "Instance name: $INSTANCE_NAME"

# Get committee index from instance metadata (set by Terraform)
COMMITTEE_INDEX=$(get_metadata "instance/attributes/committee-index")
log "Committee index: $COMMITTEE_INDEX"

if [ -z "$COMMITTEE_INDEX" ]; then
  log "ERROR: committee-index not found in instance metadata"
  exit 1
fi

# Get config from instance metadata
CONTAINER_IMAGE=$(get_metadata "instance/attributes/container-image")
COMMITTEE_CONTRACT=$(get_metadata "instance/attributes/committee-contract")
COMMITTEE_RPC_URL=$(get_metadata "instance/attributes/committee-rpc-url")
COMMITTEE_INTERVAL=$(get_metadata "instance/attributes/committee-interval")
PROJECT_ID=$(get_metadata "project/project-id")

log "Container image: $CONTAINER_IMAGE"
log "Committee contract: $COMMITTEE_CONTRACT"

# Wait for Docker to be ready
log "Waiting for Docker..."
while ! docker info &>/dev/null; do
  sleep 1
done
log "Docker is ready"

# Configure Docker to authenticate with Artifact Registry
# Use /tmp for Docker config since /root is read-only on COS
log "Configuring Docker authentication..."
export HOME=/tmp
mkdir -p /tmp/.docker

ACCESS_TOKEN=$(get_metadata "instance/service-accounts/default/token" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
echo "$ACCESS_TOKEN" | docker --config /tmp/.docker login -u oauth2accesstoken --password-stdin https://us-central1-docker.pkg.dev

# Fetch the private key from Secret Manager
log "Fetching private key from Secret Manager..."
SECRET_NAME="committee-private-key-$COMMITTEE_INDEX"

PRIVATE_KEY=$(curl -sf -H "$METADATA_HEADER" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  "https://secretmanager.googleapis.com/v1/projects/$PROJECT_ID/secrets/$SECRET_NAME/versions/latest:access" \
  | python3 -c "import sys,json,base64; print(base64.b64decode(json.load(sys.stdin)['payload']['data']).decode())" 2>/dev/null || echo "")

if [ -z "$PRIVATE_KEY" ]; then
  log "ERROR: Failed to fetch private key for index $COMMITTEE_INDEX"
  log "Make sure secret '$SECRET_NAME' exists and has a version"
  exit 1
fi

log "Private key loaded successfully"

# Stop any existing container
log "Stopping existing container if any..."
docker stop agent-runner 2>/dev/null || true
docker rm agent-runner 2>/dev/null || true

# Pull the container image
log "Pulling container image..."
docker --config /tmp/.docker pull "$CONTAINER_IMAGE"

# Create image cache directory
mkdir -p /var/lib/agent-runner/image-cache

# Run the container
# Mount Docker socket so agent-runner can manage agent containers (Docker-in-Docker)
# Mount image cache for persistence
# Use host networking so agent-runner can bind to Docker network gateway IPs
# Note: Dockerfile uses CMD not ENTRYPOINT, so we need to specify the full command
log "Starting agent-runner container..."
docker run -d \
  --name agent-runner \
  --restart always \
  --network host \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /var/lib/agent-runner/image-cache:/app/image-cache \
  -e "PRIVATE_KEY=$PRIVATE_KEY" \
  "$CONTAINER_IMAGE" \
  ./agent-runner \
  --committee-enabled \
  --committee-contract="$COMMITTEE_CONTRACT" \
  --committee-rpc-url="$COMMITTEE_RPC_URL" \
  --committee-interval="$COMMITTEE_INTERVAL" \
  --port=8080

log "Container started successfully"

# Follow logs (this keeps the script running and logs visible in serial console)
docker logs -f agent-runner
