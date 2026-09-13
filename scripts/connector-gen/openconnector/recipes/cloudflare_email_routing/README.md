# Cloudflare Email Routing

Read-only Cloudflare Email Routing REST recipe against `https://api.cloudflare.com/client/v4`. Configure a User API token (`Authorization: Bearer`). Global API Key `X-Auth-Email`/`X-Auth-Key` dual headers and `cfat_` Account API Tokens are omitted; Email Routing rejects account tokens. HTTP 200 envelopes with a populated `errors` array are treated as failures via `bodyErrorPaths`.

Operations:

- `healthcheck`: `GET /user/tokens/verify` (pinned User API Token validator)
- `addresses.list`: `GET /accounts/{accountId}/email/routing/addresses`
- `rules.list`: `GET /zones/{zoneId}/email/routing/rules` (account-scoped list omitted)

Writes (create/update/delete rule or address) are omitted. Native category is `messaging` (source Communication/Developer Tools). Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived. Live smoke is unverified.
