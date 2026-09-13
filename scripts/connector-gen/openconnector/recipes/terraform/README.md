# HCP Terraform

Read-only international HCP Terraform Cloud API recipe for the pinned OpenConnector `terraform` provider. Configure a user or team API token from HCP Terraform user/team token settings. The runner sends `Authorization: Bearer` with `Accept` and `Content-Type: application/vnd.api+json` to `https://app.terraform.io/api/v2`.

Covered operations: credential-only `healthcheck` (`GET /account/details`), `organizations.list`, `organizations.get`, `workspaces.list`, and `workspaces.get`. Organization tokens cannot call `/account/details`. Workspace-by-name, run list/get, and writes are omitted. Self-hosted Terraform Enterprise hostnames are not admitted; the pinned source hardcodes `app.terraform.io`.

Native category is `dev-tools` (source Developer Tools is not in the Rust CATEGORIES allowlist). The upstream user-agent is not sent.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://developer.hashicorp.com/terraform/cloud-docs/api-docs and https://developer.hashicorp.com/terraform/cloud-docs/users-teams-organizations/api-tokens. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure a user/team token, call `healthcheck` with `{}`, then `organizations.list`.
