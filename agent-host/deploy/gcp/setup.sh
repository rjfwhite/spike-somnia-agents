#!/bin/bash
set -e

# Configuration
PROJECT_ID=$(gcloud config get-value project)
REGION="us-central1"
ZONE="us-central1-a"
REPO_NAME="agent-host-http-repo"
IMAGE_NAME="agent-host-http"
VM_NAME="somnia-agent-host-http"
SERVICE_ACCOUNT_NAME="github-actions-deployer-http"

echo "Using Project: $PROJECT_ID"
echo "Region: $REGION"
echo "Zone: $ZONE"

# 1. Enable APIs
echo "Enabling APIs..."
gcloud services enable artifactregistry.googleapis.com compute.googleapis.com

# 2. Create Artifact Registry Repository
if ! gcloud artifacts repositories describe $REPO_NAME --location=$REGION &>/dev/null; then
    echo "Creating Artifact Registry repository..."
    gcloud artifacts repositories create $REPO_NAME \
        --repository-format=docker \
        --location=$REGION \
        --description="Docker repository for Somnia Agent Host HTTP"
else
    echo "Artifact Registry repository $REPO_NAME already exists."
fi

# 3. Create Service Account for GitHub Actions
if ! gcloud iam service-accounts describe $SERVICE_ACCOUNT_NAME@$PROJECT_ID.iam.gserviceaccount.com &>/dev/null; then
    echo "Creating Service Account..."
    gcloud iam service-accounts create $SERVICE_ACCOUNT_NAME \
        --display-name="GitHub Actions Deployer (HTTP)"
else
    echo "Service Account $SERVICE_ACCOUNT_NAME already exists."
fi

# Grant permissions
echo "Granting permissions..."
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SERVICE_ACCOUNT_NAME@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/artifactregistry.writer" \
    --quiet

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SERVICE_ACCOUNT_NAME@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/compute.instanceAdmin.v1" \
    --quiet

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SERVICE_ACCOUNT_NAME@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/iam.serviceAccountUser" \
    --quiet

# 4. Generate Key for GitHub Secrets
KEY_FILE="gcp-sa-key.json"
if [ ! -f "$KEY_FILE" ]; then
    echo "Generating Service Account Key..."
    gcloud iam service-accounts keys create $KEY_FILE \
        --iam-account=$SERVICE_ACCOUNT_NAME@$PROJECT_ID.iam.gserviceaccount.com
    echo "Key saved to $KEY_FILE. Add this to GitHub Secrets as GCP_SA_KEY."
else
    echo "Key file $KEY_FILE already exists."
fi

# 5. Create firewall rule for HTTP on port 80
if ! gcloud compute firewall-rules describe allow-http-80 &>/dev/null; then
    echo "Creating firewall rule for port 80..."
    gcloud compute firewall-rules create allow-http-80 \
        --allow tcp:80 \
        --target-tags=http-server \
        --description="Allow HTTP traffic on port 80"
else
    echo "Firewall rule allow-http-80 already exists."
fi

# 6. Create GCE VM
if ! gcloud compute instances describe $VM_NAME --zone=$ZONE &>/dev/null; then
    echo "Creating GCE VM..."
    gcloud compute instances create-with-container $VM_NAME \
        --project=$PROJECT_ID \
        --zone=$ZONE \
        --machine-type=e2-small \
        --image-family=cos-stable \
        --image-project=cos-cloud \
        --boot-disk-size=20GB \
        --container-image=us-docker.pkg.dev/cloudrun/container/hello \
        --container-mount-host-path=mount-path=/var/run/docker.sock,host-path=/var/run/docker.sock,mode=rw \
        --container-env=DOCKER_HOST=unix:///var/run/docker.sock \
        --tags=http-server
else
    echo "VM $VM_NAME already exists."
fi

# Get external IP
EXTERNAL_IP=$(gcloud compute instances describe $VM_NAME --zone=$ZONE --format="value(networkInterfaces[0].accessConfigs[0].natIP)")

echo ""
echo "=============================================="
echo "Setup Complete!"
echo "=============================================="
echo ""
echo "VM External IP: $EXTERNAL_IP"
echo "Service URL: http://$EXTERNAL_IP"
echo ""
echo "GitHub Secrets to add:"
echo "  - GCP_SA_KEY: contents of '$KEY_FILE'"
echo "  - GCP_PROJECT_ID: $PROJECT_ID"
