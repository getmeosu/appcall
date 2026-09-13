# Ongage

Read-only Ongage API Key REST recipe. Configure an API key from the Ongage API Keys tab and send it as `x-api-key` to `https://api.ongage.com/`. Official FAQ requires this host for API Key auth; the older `api.ongage.net` username/password/account-code headers are deprecated and are not used.

Covered operations: credential-only `healthcheck` (`GET /api/lists?limit=1`), `lists.list`, `lists.get`, `contacts.get-by-email`, and `contacts.get-by-id`. Writes, imports, status changes, and reports are omitted. HTTP 200 envelopes with `metadata.error: true` are demoted via `bodyErrorPaths`. Native returns raw Ongage JSON under `data` rather than the pinned `{lists,total}` / `{list}` / `{contact}` unwrap. Native category is `email-marketing`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache-2.0). Official docs: https://ongage.atlassian.net/wiki/spaces/HELP/pages/70418454/API+FAQ. Fixtures are independently derived from official docs plus pinned source; live authentication remains unverified.
