variable "cloudflare_account_id" {
  description = "Cloudflare account ID."
  type        = string
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID (optional; reserved for zone-scoped resources)."
  type        = string
  default     = ""
}

variable "project_name" {
  description = "Project name used for resource naming."
  type        = string
  default     = "news-reader"
}

variable "app_domain" {
  description = "Production hostname for the Cloudflare Pages deployment."
  type        = string
  default     = "news-reader.pages.dev"
}

variable "allowed_email_domains" {
  description = "Email domains allowed through Cloudflare Access for /api/fetch-rss."
  type        = list(string)
  default     = ["rampazzo.eu"]
}
