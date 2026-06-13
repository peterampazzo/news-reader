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

variable "production_branch" {
  description = "Required by Cloudflare Pages API; does not imply Git integration."
  type        = string
  default     = "main"
}

variable "compatibility_date" {
  description = "Cloudflare Workers/Pages compatibility date for runtime bindings."
  type        = string
  default     = "2026-06-09"
}

variable "app_domain" {
  description = "Production hostname for Access and Pages. Defaults to \"<project_name>.pages.dev\" when null."
  type        = string
  default     = null
}

variable "allowed_email_domains" {
  description = "Email domains allowed through Cloudflare Access for /api/fetch-rss."
  type        = list(string)
  default     = ["rampazzo.eu"]
}
