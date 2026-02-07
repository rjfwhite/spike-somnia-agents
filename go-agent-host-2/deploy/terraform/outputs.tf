output "instance_names" {
  description = "Committee VM instance names"
  value       = [for i in google_compute_instance.committee : i.name]
}

output "instance_ips" {
  description = "Committee VM external IPs"
  value       = [for i in google_compute_instance.committee : i.network_interface[0].access_config[0].nat_ip]
}

output "service_account_email" {
  description = "Service account email"
  value       = google_service_account.committee.email
}

output "secret_names" {
  description = "Secret Manager secret names (add secret keys to these)"
  value       = [for s in google_secret_manager_secret.committee_keys : s.secret_id]
}
