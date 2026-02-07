# Committee Deployment with Terraform

Deploys a Managed Instance Group of 5 VMs to form the Somnia agent committee. Each VM gets a unique secret key from Secret Manager.

## Prerequisites

1. [Terraform](https://www.terraform.io/downloads) >= 1.0
2. [gcloud CLI](https://cloud.google.com/sdk/docs/install) authenticated
3. GCP project with billing enabled
4. APIs enabled:
   ```bash
   gcloud services enable \
     compute.googleapis.com \
     secretmanager.googleapis.com \
     artifactregistry.googleapis.com
   ```

## Quick Start

### 1. Configure

```bash
cd deploy/terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your values
```

### 2. Deploy Infrastructure

```bash
terraform init
terraform plan
terraform apply
```

### 3. Add Secret Keys

After Terraform creates the secrets, add the secret keys:

```bash
# For each committee member (0-4):
echo -n 'your-secret-key-hex' | gcloud secrets versions add committee-secret-key-0 --data-file=-
echo -n 'your-secret-key-hex' | gcloud secrets versions add committee-secret-key-1 --data-file=-
echo -n 'your-secret-key-hex' | gcloud secrets versions add committee-secret-key-2 --data-file=-
echo -n 'your-secret-key-hex' | gcloud secrets versions add committee-secret-key-3 --data-file=-
echo -n 'your-secret-key-hex' | gcloud secrets versions add committee-secret-key-4 --data-file=-
```

### 4. Trigger VM Recreation (to pick up secrets)

```bash
# Force VMs to restart and fetch secrets
gcloud compute instance-groups managed rolling-action restart somnia-committee --zone=us-central1-a
```

## Updating the Container Image

To deploy a new version:

```bash
# Update the container_image variable
terraform apply -var="container_image=us-central1-docker.pkg.dev/project/repo/image:newtag"
```

Or trigger a rolling restart:

```bash
gcloud compute instance-groups managed rolling-action replace somnia-committee --zone=us-central1-a
```

## Monitoring

### Check Instance Status

```bash
gcloud compute instance-groups managed list-instances somnia-committee --zone=us-central1-a
```

### View Logs

```bash
# Via gcloud
gcloud compute instances get-serial-port-output somnia-committee-xxxx --zone=us-central1-a

# Or via Cloud Logging
gcloud logging read 'resource.type="gce_instance" AND resource.labels.instance_id="INSTANCE_ID"' --limit=50
```

### SSH into an Instance

```bash
gcloud compute ssh somnia-committee-xxxx --zone=us-central1-a
# Then view container logs:
docker logs agent-runner
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Managed Instance Group                    │
│                      (somnia-committee)                      │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐       ┌──────────────┐ │
│  │ committee-0  │  │ committee-1  │  ...  │ committee-4  │ │
│  │              │  │              │       │              │ │
│  │  SECRET_KEY  │  │  SECRET_KEY  │       │  SECRET_KEY  │ │
│  │ from secret-0│  │ from secret-1│       │ from secret-4│ │
│  └──────┬───────┘  └──────┬───────┘       └──────┬───────┘ │
│         │                 │                      │         │
└─────────┼─────────────────┼──────────────────────┼─────────┘
          │                 │                      │
          ▼                 ▼                      ▼
    ┌─────────────────────────────────────────────────────┐
    │              Secret Manager                          │
    │  committee-secret-key-0                              │
    │  committee-secret-key-1                              │
    │  committee-secret-key-2                              │
    │  committee-secret-key-3                              │
    │  committee-secret-key-4                              │
    └─────────────────────────────────────────────────────┘
          │
          ▼
    ┌─────────────────────────────────────────────────────┐
    │              Committee Contract                      │
    │              (on Somnia network)                    │
    │                                                      │
    │  Each VM sends heartbeat transactions every 30s     │
    └─────────────────────────────────────────────────────┘
```

## How Instance Index Assignment Works

The startup script determines which secret key to use based on the instance name. MIG instances are named `somnia-committee-XXXX` where XXXX is random. The script:

1. Extracts the instance name
2. Uses a hash of the name to consistently map to an index 0-4
3. Fetches `committee-secret-key-{index}` from Secret Manager

This means if a VM is replaced, it might get a different index. This is fine because:
- All 5 keys are valid committee members
- The contract doesn't care which address sends heartbeats
- Auto-healing just needs *some* valid key

## Cleanup

```bash
terraform destroy
```
