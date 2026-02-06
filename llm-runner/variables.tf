variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

variable "zone" {
  description = "GCP zone"
  type        = string
  default     = "us-central1-a"
}

variable "name_prefix" {
  description = "Prefix for all resource names"
  type        = string
  default     = "llm-runner"
}

# --- Compute ---

variable "machine_type" {
  description = "GCP machine type. g4-standard-48 = 1x RTX PRO 6000 Blackwell (96 GB GDDR7), 48 vCPUs, 180 GB RAM."
  type        = string
  default     = "g4-standard-48"
}

variable "boot_image" {
  description = "Boot disk image (Deep Learning VM with CUDA drivers pre-installed)"
  type        = string
  default     = "projects/deeplearning-platform-release/global/images/family/common-cu128-ubuntu-2204-nvidia-570"
}

variable "disk_size_gb" {
  description = "Boot disk size in GB (needs room for model weights)"
  type        = number
  default     = 200
}

# --- Model / SGLang ---

variable "model_id" {
  description = "HuggingFace model ID to serve"
  type        = string
  default     = "Qwen/Qwen3-30B-A3B"
}

variable "sglang_port" {
  description = "Port SGLang listens on"
  type        = number
  default     = 30000
}

variable "tensor_parallel_size" {
  description = "Tensor-parallel degree (number of GPUs to shard across)"
  type        = number
  default     = 1
}

variable "hf_token" {
  description = "HuggingFace token for gated model access (optional)"
  type        = string
  default     = ""
  sensitive   = true
}

# --- Network access ---

variable "allowed_ssh_ranges" {
  description = "CIDR ranges allowed to SSH into the instance"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "allowed_api_ranges" {
  description = "CIDR ranges allowed to reach the SGLang API"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}
