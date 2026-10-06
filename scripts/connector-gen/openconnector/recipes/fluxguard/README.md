# Fluxguard

International Fluxguard REST API recipe. Configure an API key from Fluxguard organization settings. The runner sends `x-api-key` to `api.fluxguard.com`. Official docs still label the API as beta.

Version 0.2.0 exposes the complete documented HTTP surface (account, pages, sessions, sites, webhooks, categories) plus EventOnly `webhook.page_changed` and `webhook.alarm`. Native category is `dev-tools`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache-2.0). Fixtures use `fixture-api-token` only. Live smoke is unverified.
