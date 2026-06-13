# ---------------------------------------------------------------------------
# Worker custom domain — routes news.peterampazzo.com to the Worker service.
# The Worker itself is deployed by Wrangler in CI (deploy-on-tag workflow).
# ---------------------------------------------------------------------------

resource "cloudflare_worker_domain" "app" {
  account_id = var.cloudflare_account_id
  zone_id    = var.cloudflare_zone_id
  hostname   = local.app_domain
  service    = var.project_name
}

# ---------------------------------------------------------------------------
# Zero Trust Access — protect the entire app on the custom domain.
# ---------------------------------------------------------------------------

resource "cloudflare_zero_trust_access_application" "app" {
  account_id = var.cloudflare_account_id
  name       = "${var.project_name}-app"
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

  depends_on = [cloudflare_worker_domain.app]
}
