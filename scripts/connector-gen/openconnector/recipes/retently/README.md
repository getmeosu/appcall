# Retently

Read-only international **Retently CX API v2** recipe. Create an API token under Settings → API keys (or Settings → API Tokens). Store it as `apiKey`. Requests send `X-Api-Key: {{apiKey}}` and `Accept: application/json` to `https://app.retently.com`.

## Operations

- `healthcheck`: `GET /api/v2/ping` with empty input (cheap authenticated account snapshot; pinned credential validator).
- `customers.list`: `GET /api/v2/customers` with optional `email`, `page`, `limit` (1–1000), `sort`, `startDate`, `endDate`, and `match`.
- `customers.get`: `GET /api/v2/customers/{{customerId}}`.
- `feedback.list`: `GET /api/v2/feedback` with optional `email`, `customerId`, `campaignId`, pagination, dates, and `match`.
- `templates.list`: `GET /api/v2/templates`.

Successful responses are raw provider JSON under AppCall `data`. Customer upserts, survey sends, imports, suppressions, and indexed `attributes[n][name]` filters are omitted.

## Adaptations

Pinned source and official docs agree on `https://app.retently.com` and the recommended `X-Api-Key` header. Native category is `crm` (source Marketing/Data are not in the Rust CATEGORIES allowlist). Legacy `Authorization: api_key=` and query `api_key` are omitted. The upstream user-agent is not sent. Official GET examples often include `Content-Type: application/json`; native GET requests omit it because the pinned source only sets Content-Type when a body is present.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
