terraform {
  required_version = ">= 1.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }

  backend "gcs" {
    bucket = "somnia-agents-terraform-state"
    prefix = "committee"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# Service account for committee VMs
resource "google_service_account" "committee" {
  account_id   = "somnia-committee"
  display_name = "Somnia Agent Committee"
}

# Secret Manager access
resource "google_project_iam_member" "secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.committee.email}"
}

# Logging
resource "google_project_iam_member" "log_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.committee.email}"
}

# Artifact Registry read access (to pull container images)
resource "google_project_iam_member" "artifact_reader" {
  project = var.project_id
  role    = "roles/artifactregistry.reader"
  member  = "serviceAccount:${google_service_account.committee.email}"
}

# Secret Manager secrets for private keys
resource "google_secret_manager_secret" "committee_keys" {
  count     = var.committee_size
  secret_id = "committee-private-key-${count.index}"

  replication {
    auto {}
  }
}

# Secret Manager secret for Grafana Alloy token
resource "google_secret_manager_secret" "grafana_alloy_token" {
  count     = var.grafana_alloy_token != "" ? 1 : 0
  secret_id = "grafana-alloy-token"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "grafana_alloy_token" {
  count       = var.grafana_alloy_token != "" ? 1 : 0
  secret      = google_secret_manager_secret.grafana_alloy_token[0].id
  secret_data = var.grafana_alloy_token
}

# Firewall: allow HTTP on 8080
resource "google_compute_firewall" "allow_http" {
  name    = "somnia-committee-allow-http"
  network = "default"

  allow {
    protocol = "tcp"
    ports    = ["8080"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["somnia-committee"]
}

# Firewall: allow GCP health checks
resource "google_compute_firewall" "allow_health_check" {
  name    = "somnia-committee-allow-hc"
  network = "default"

  allow {
    protocol = "tcp"
    ports    = ["8080"]
  }

  source_ranges = ["130.211.0.0/22", "35.191.0.0/16"]
  target_tags   = ["somnia-committee"]
}

# Individual committee member VMs (not MIG, to ensure unique indices)
resource "google_compute_instance" "committee" {
  count        = var.committee_size
  name         = "somnia-committee-${count.index}"
  machine_type = var.machine_type
  zone         = var.zone

  tags = ["somnia-committee", "http-server"]

  boot_disk {
    initialize_params {
      image = "cos-cloud/cos-stable"
      size  = 50
    }
  }

  network_interface {
    network = "default"
    access_config {} # Ephemeral public IP
  }

  service_account {
    email  = google_service_account.committee.email
    scopes = ["cloud-platform"]
  }

  metadata = {
    google-logging-enabled = "true"

    # Explicit committee index for private key lookup
    committee-index = count.index

    # Pass config as metadata so startup script can read it
    container-image         = var.container_image
    somnia-agents-contract  = var.somnia_agents_contract
    rpc-url                 = var.rpc_url
    heartbeat-interval      = var.heartbeat_interval
    grafana-alloy-enabled   = var.grafana_alloy_token != "" ? "true" : "false"
  }

  metadata_startup_script = file("${path.module}/startup.sh")

  # Allow Terraform to update instances in place when possible
  allow_stopping_for_update = true
}
