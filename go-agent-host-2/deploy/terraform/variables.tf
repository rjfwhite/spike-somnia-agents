variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP Region"
  type        = string
  default     = "us-central1"
}

variable "zone" {
  description = "GCP Zone"
  type        = string
  default     = "us-central1-a"
}

variable "committee_size" {
  description = "Number of committee members"
  type        = number
  default     = 5
}

variable "committee_contract" {
  description = "Committee smart contract address"
  type        = string
}

variable "committee_rpc_url" {
  description = "Ethereum RPC URL"
  type        = string
  default     = "https://dream-rpc.somnia.network/"
}

variable "committee_interval" {
  description = "Heartbeat interval"
  type        = string
  default     = "30s"
}

variable "machine_type" {
  description = "GCE machine type"
  type        = string
  default     = "e2-medium"
}

variable "container_image" {
  description = "Container image to deploy"
  type        = string
}
