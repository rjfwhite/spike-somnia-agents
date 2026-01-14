PROJECT_ID=somnia-agents
GHA_SA=github-actions-deployer@${PROJECT_ID}.iam.gserviceaccount.com
RUNTIME_SA=937722299914-compute@developer.gserviceaccount.com  # adjust to your actual runtime SA

# 1) Allow GitHub Actions SA to manage Cloud Run services
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${GHA_SA}" \
  --role="roles/run.admin"
  --project="$PROJECT_ID"

# 2) Allow GitHub Actions SA to use the runtime service account
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --member="serviceAccount:${GHA_SA}" \
  --role="roles/iam.serviceAccountUser" \
  --project="$PROJECT_ID"
