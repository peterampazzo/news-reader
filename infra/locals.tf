locals {
  app_domain = coalesce(var.app_domain, "${var.project_name}.pages.dev")
}
