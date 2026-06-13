resource "cloudflare_zero_trust_access_application" "fetch_rss" {
  account_id = var.cloudflare_account_id
  name       = "${var.project_name}-fetch-rss"
  domain     = "${var.app_domain}/api/fetch-rss"
  type       = "self_hosted"

  path_cookie_attribute = true

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
}
