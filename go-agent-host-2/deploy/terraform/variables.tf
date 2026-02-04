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

variable "somnia_agents_contract" {
  description = "SomniaAgents smart contract address (AgentRegistry and Committee are resolved from it)"
  type        = string
}

variable "rpc_url" {
  description = "Blockchain RPC URL"
  type        = string
  default     = "https://dream-rpc.somnia.network/"
}

variable "heartbeat_interval" {
  description = "Committee heartbeat interval"
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

variable "grafana_alloy_token" {
  description = "Grafana Cloud Alloy token for observability"
  type        = string
  default     = ""
  sensitive   = true
}
