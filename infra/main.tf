# ---------------------------------------------------------------------------
# Cloudflare Pages project (Direct Upload / Wrangler deploy from CI).
# Git integration is not configured here — deployments come from deploy-on-tag.
# ---------------------------------------------------------------------------

resource "cloudflare_pages_project" "news_reader" {
  account_id        = var.cloudflare_account_id
  name              = var.project_name
  production_branch = var.production_branch

  deployment_configs = {
    production = {
      compatibility_date  = var.compatibility_date
      compatibility_flags = ["nodejs_compat"]
    }

    preview = {
      compatibility_date  = var.compatibility_date
      compatibility_flags = ["nodejs_compat"]
    }
  }
}

# ---------------------------------------------------------------------------
# Zero Trust Access — protect the entire app.
# ---------------------------------------------------------------------------

resource "cloudflare_zero_trust_access_application" "fetch_rss" {
  account_id = var.cloudflare_account_id
  name       = var.project_name
  domain     = local.app_domain
  type       = "self_hosted"

  policies = [{
    name       = "Allow authorized email domains"
    decision   = "allow"
    precedence = 1
    include = [
      for d in var.allowed_email_domains : {
        email_domain = { domain = d }
      }
    ]
  }]

  depends_on = [cloudflare_pages_project.news_reader]
}
