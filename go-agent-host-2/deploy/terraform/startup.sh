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
SOMNIA_AGENTS_CONTRACT=$(get_metadata "instance/attributes/somnia-agents-contract")
RPC_URL=$(get_metadata "instance/attributes/rpc-url")
HEARTBEAT_INTERVAL=$(get_metadata "instance/attributes/heartbeat-interval")
PROJECT_ID=$(get_metadata "project/project-id")

log "Container image: $CONTAINER_IMAGE"
log "SomniaAgents contract: $SOMNIA_AGENTS_CONTRACT"

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
  --somnia-agents-contract="$SOMNIA_AGENTS_CONTRACT" \
  --rpc-url="$RPC_URL" \
  --committee-enabled \
  --committee-interval="$HEARTBEAT_INTERVAL" \
  --listener-enabled \
  --port=8080

log "Container started successfully"

# =========================================================================
# Grafana Alloy Setup (if enabled)
# =========================================================================

GRAFANA_ALLOY_ENABLED=$(get_metadata "instance/attributes/grafana-alloy-enabled")

if [ "$GRAFANA_ALLOY_ENABLED" = "true" ]; then
  log "Setting up Grafana Alloy..."

  # Fetch Grafana Alloy token from Secret Manager
  GRAFANA_ALLOY_TOKEN=$(curl -sf -H "$METADATA_HEADER" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    "https://secretmanager.googleapis.com/v1/projects/$PROJECT_ID/secrets/grafana-alloy-token/versions/latest:access" \
    | python3 -c "import sys,json,base64; print(base64.b64decode(json.load(sys.stdin)['payload']['data']).decode())" 2>/dev/null || echo "")

  if [ -z "$GRAFANA_ALLOY_TOKEN" ]; then
    log "WARNING: Failed to fetch Grafana Alloy token, skipping Alloy setup"
  else
    log "Grafana Alloy token loaded"

    # Create Alloy config directory
    mkdir -p /var/lib/alloy

    # Create Alloy config file
    cat > /var/lib/alloy/config.alloy << 'ALLOY_CONFIG'
// Grafana Alloy configuration for somnia-agents committee VMs

logging {
  level  = "info"
  format = "logfmt"
}

// Prometheus remote write to Grafana Cloud
prometheus.remote_write "grafana_cloud" {
  endpoint {
    url = "https://prometheus-prod-36-prod-gb-south-1.grafana.net/api/prom/push"

    basic_auth {
      username = env("GRAFANA_CLOUD_PROMETHEUS_USER")
      password = env("GRAFANA_ALLOY_TOKEN")
    }
  }
}

// Loki write to Grafana Cloud
loki.write "grafana_cloud" {
  endpoint {
    url = "https://logs-prod-030.grafana.net/loki/api/v1/push"

    basic_auth {
      username = env("GRAFANA_CLOUD_LOKI_USER")
      password = env("GRAFANA_ALLOY_TOKEN")
    }
  }
}

// Discover Docker containers
discovery.docker "containers" {
  host = "unix:///var/run/docker.sock"
}

// Collect Docker container logs
loki.source.docker "containers" {
  host = "unix:///var/run/docker.sock"
  targets = discovery.docker.containers.targets
  forward_to = [loki.process.containers.receiver]
  relabel_rules = loki.relabel.containers.rules
}

loki.relabel "containers" {
  forward_to = []

  rule {
    source_labels = ["__meta_docker_container_name"]
    target_label  = "container"
  }

  rule {
    source_labels = ["__meta_docker_container_id"]
    target_label  = "container_id"
  }
}

loki.process "containers" {
  forward_to = [loki.write.grafana_cloud.receiver]

  stage.static_labels {
    values = {
      job = "docker",
      instance = env("HOSTNAME"),
    }
  }
}

// Collect node metrics
prometheus.exporter.unix "node" {
  set_collectors = ["cpu", "meminfo", "diskstats", "filesystem", "loadavg", "netdev"]
}

prometheus.scrape "node" {
  targets    = prometheus.exporter.unix.node.targets
  forward_to = [prometheus.remote_write.grafana_cloud.receiver]

  scrape_interval = "30s"
}

// Scrape agent-runner metrics
prometheus.scrape "agent_runner" {
  targets = [
    {"__address__" = "localhost:8080", "job" = "agent-runner"},
  ]
  metrics_path = "/metrics"
  forward_to = [prometheus.remote_write.grafana_cloud.receiver]

  scrape_interval = "15s"
}
ALLOY_CONFIG

    # Stop existing Alloy container if running
    docker stop grafana-alloy 2>/dev/null || true
    docker rm grafana-alloy 2>/dev/null || true

    # Pull and run Grafana Alloy
    log "Starting Grafana Alloy container..."
    docker run -d \
      --name grafana-alloy \
      --restart always \
      --network host \
      -v /var/run/docker.sock:/var/run/docker.sock:ro \
      -v /var/lib/alloy/config.alloy:/etc/alloy/config.alloy:ro \
      -v /proc:/host/proc:ro \
      -v /sys:/host/sys:ro \
      -v /:/host/root:ro \
      -e "GRAFANA_ALLOY_TOKEN=$GRAFANA_ALLOY_TOKEN" \
      -e "GRAFANA_CLOUD_PROMETHEUS_USER=1649652" \
      -e "GRAFANA_CLOUD_LOKI_USER=1109653" \
      -e "HOSTNAME=$INSTANCE_NAME" \
      grafana/alloy:latest \
      run --server.http.listen-addr=0.0.0.0:12345 /etc/alloy/config.alloy

    log "Grafana Alloy started"
  fi
else
  log "Grafana Alloy not enabled"
fi

# Keep the script running so the VM doesn't terminate
# Container logs are captured by Google Cloud Logging via Docker's logging driver
# No need for 'docker logs -f' which would duplicate log entries
while true; do
  sleep 3600
done
