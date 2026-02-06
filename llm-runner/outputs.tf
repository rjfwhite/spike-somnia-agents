output "instance_name" {
  description = "Name of the compute instance"
  value       = google_compute_instance.llm_runner.name
}

output "instance_ip" {
  description = "External IP of the compute instance"
  value       = google_compute_instance.llm_runner.network_interface[0].access_config[0].nat_ip
}

output "sglang_endpoint" {
  description = "SGLang OpenAI-compatible API endpoint"
  value       = "http://${google_compute_instance.llm_runner.network_interface[0].access_config[0].nat_ip}:${var.sglang_port}/v1"
}

output "ssh_command" {
  description = "SSH into the instance"
  value       = "gcloud compute ssh ${google_compute_instance.llm_runner.name} --zone=${var.zone} --project=${var.project_id}"
}
