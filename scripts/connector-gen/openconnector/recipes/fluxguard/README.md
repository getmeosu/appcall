# Fluxguard

International **Fluxguard REST API** recipe covering origin healthcheck plus every documented Composio `FLUXGUARD_*` HTTP tool except `FLUXGUARD_WEBHOOK_NOTIFICATION` (13 operations: 12 mapped tools + healthcheck).

Configure an API key from Fluxguard organization settings. The runner sends `x-api-key` to `https://api.fluxguard.com`. Official docs still label the API as beta.

## Operations

- Auth / account: `healthcheck` and `account.get` (`GET /account`). Healthcheck is the origin credential probe and is not a Composio slug. `account.get` maps `FLUXGUARD_GET_USER`; optional `user_id` is accepted and not sent.
- Pages: `pages.create` (`POST /add-page`), `pages.get`, `pages.delete`.
- Sites / sessions: `sites.delete` (`DELETE /site/{siteId}`), `sessions.crawl` (`POST /site/{siteId}/session/{sessionId}/crawl`).
- Categories: `categories.list`, `categories.create` (`POST /account/category`).
- Webhooks: `webhooks.list`, `webhooks.sample`, `webhooks.create` (`PUT /account/webhook`), `webhooks.delete` (`DELETE /account/webhook` with JSON `{id}`).

`FLUXGUARD_WEBHOOK_NOTIFICATION` is not implemented. It POSTs a simulated payload to a caller-supplied URL, which is not a Fluxguard API endpoint and cannot be admitted under `network.allowedHosts` (`api.fluxguard.com`) without opening SSRF. Composio lists 0 triggers; inbound webhook ops are not added.

Successful JSON responses are raw Fluxguard JSON under AppCall `data`. Optional add-page fields are omitted when unset. Path fields use official camelCase (`siteId`, `sessionId`, `pageId`) matching origin `pages.get`. The upstream user-agent is not sent.

Native category is `dev-tools` (source Data/Developer Tools; Rust CATEGORIES has no data bucket).

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://fluxguard.com/how-to-guides/use-our-api/. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
