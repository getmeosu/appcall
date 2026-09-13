# Fluxguard

Read-only international Fluxguard REST API recipe. Configure an API key from Fluxguard organization settings. The runner sends `x-api-key` to `api.fluxguard.com`. Official docs still label the API as beta.

Covered operations: credential-only `healthcheck` (`GET /account`), `webhooks.list`, `webhooks.sample`, `categories.list`, and `pages.get`. Add-page, crawl, webhook upsert/delete, category create, and site/page deletes are not exposed.

Native category is `dev-tools` (source Data/Developer Tools; Rust CATEGORIES has no data bucket).

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache-2.0). Live smoke is unverified; fixtures only.
