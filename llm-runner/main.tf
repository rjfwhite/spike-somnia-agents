terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}

# --- Firewall (on default network) ---

resource "google_compute_firewall" "sglang" {
  name    = "${var.name_prefix}-allow-sglang"
  network = "default"

  allow {
    protocol = "tcp"
    ports    = [tostring(var.sglang_port)]
  }

  source_ranges = var.allowed_api_ranges
  target_tags   = ["llm-runner"]
}

# --- Compute (G4: 1x NVIDIA RTX PRO 6000 Blackwell, 96 GB GDDR7) ---

resource "google_compute_instance" "llm_runner" {
  name         = "${var.name_prefix}-instance"
  machine_type = var.machine_type
  zone         = var.zone

  tags = ["llm-runner"]

  boot_disk {
    initialize_params {
      image = var.boot_image
      size  = var.disk_size_gb
      type  = "hyperdisk-balanced"
    }
  }

  scheduling {
    on_host_maintenance = "TERMINATE"
    automatic_restart   = true
  }

  network_interface {
    network = "default"

    access_config {
      # Ephemeral public IP
    }
  }

  metadata = {
    install-nvidia-driver = "True"
    startup-script = templatefile("${path.module}/scripts/startup.sh", {
      model_id    = var.model_id
      sglang_port = var.sglang_port
      hf_token    = var.hf_token
      tp_size     = var.tensor_parallel_size
    })
  }
}
