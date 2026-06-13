output "pages_project_name" {
  description = "Cloudflare Pages project name (matches wrangler / deploy target)."
  value       = cloudflare_pages_project.news_reader.name
}

output "pages_project_url" {
  description = "Default production URL for the Pages project."
  value       = "https://${local.app_domain}"
}

output "access_application_id" {
  description = "Cloudflare Zero Trust Access application ID for /api/fetch-rss."
  value       = cloudflare_zero_trust_access_application.fetch_rss.id
}

output "access_application_aud" {
  description = "JWT audience tag for the Access application."
  value       = cloudflare_zero_trust_access_application.fetch_rss.aud
}

output "protected_path" {
  description = "Path protected by Cloudflare Access."
  value       = "${local.app_domain}/api/fetch-rss"
}

output "cloudflare_zone_id" {
  description = "Configured zone ID (when set)."
  value       = var.cloudflare_zone_id
}
