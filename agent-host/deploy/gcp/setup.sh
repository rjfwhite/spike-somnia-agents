#!/bin/bash
set -e

# Configuration
PROJECT_ID=$(gcloud config get-value project)
REGION="us-central1"
ZONE="us-central1-a"
REPO_NAME="agent-host-repo"
IMAGE_NAME="agent-host"
VM_NAME="somnia-agent-host"
SERVICE_ACCOUNT_NAME="github-actions-deployer"

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
        --description="Docker repository for Somnia Agent Host"
else
    echo "Artifact Registry repository $REPO_NAME already exists."
fi

# 3. Create Service Account for GitHub Actions
if ! gcloud iam service-accounts describe $SERVICE_ACCOUNT_NAME@$PROJECT_ID.iam.gserviceaccount.com &>/dev/null; then
    echo "Creating Service Account..."
    gcloud iam service-accounts create $SERVICE_ACCOUNT_NAME \
        --display-name="GitHub Actions Deployer"
else
    echo "Service Account $SERVICE_ACCOUNT_NAME already exists."
fi

# Grant permissions
echo "Granting permissions..."
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SERVICE_ACCOUNT_NAME@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SERVICE_ACCOUNT_NAME@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/compute.instanceAdmin.v1"

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SERVICE_ACCOUNT_NAME@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/iam.serviceAccountUser"

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

# 5. Create/Update GCE VM
# We use a startup script to ensure the docker socket permissions are correct if needed,
# though the mount itself handles the access.
if ! gcloud compute instances describe $VM_NAME --zone=$ZONE &>/dev/null; then
    echo "Creating GCE VM..."
    # Placeholder for PRIVATE_KEY - user must update this later or pass as env
    read -p "Enter Somnia Private Key (or press enter to set manually later): " PRIVATE_KEY
    
    gcloud compute instances create-with-container $VM_NAME \
        --project=$PROJECT_ID \
        --zone=$ZONE \
        --machine-type=e2-small \
        --image-family=cos-stable \
        --image-project=cos-cloud \
        --boot-disk-size=20GB \
        --container-image=us-docker.pkg.dev/cloudrun/container/hello \
        --container-mount-host-path=mount-path=/var/run/docker.sock,host-path=/var/run/docker.sock,mode=rw \
        --container-env=DOCKER_HOST=unix:///var/run/docker.sock,PRIVATE_KEY="${PRIVATE_KEY:-changeme}" \
        --tags=http-server

    # Allow HTTP traffic
    gcloud compute firewall-rules create allow-http-8080 \
        --allow tcp:8080 \
        --target-tags=http-server \
        --description="Allow port 8080 for agent-host"
else
    echo "VM $VM_NAME already exists."
fi

echo ""
echo "Setup Complete!"
echo "------------------------------------------------"
echo "1. Add the content of '$KEY_FILE' to your GitHub Repository Secrets with name 'GCP_SA_KEY'."
echo "2. Provide 'GCP_PROJECT_ID' secret with value '$PROJECT_ID'."
echo "3. If you didn't provide the private key, update the VM environment variable:"
echo "   gcloud compute instances update-container $VM_NAME --zone=$ZONE --container-env=PRIVATE_KEY=YOUR_KEY"
