# Clari Copilot

Read-only international **Clari Copilot REST API** recipe. Create the workspace API key and API password under Copilot Web App → Workspace Settings → Integrations → Copilot API and store them as `apiKey` and `apiPassword`. Requests send `X-Api-Key`, `X-Api-Password`, and `Accept: application/json` to `https://rest-api.copilot.clari.com`. Rate limits: 10 requests/second and 100,000 requests/week (week starts Sunday 00:00 GMT).

## Operations

- `healthcheck`: `GET /users` with empty input (official credential probe; pinned validator).
- `topics.list`: `GET /v2/topics` with optional `filterModifiedLt` / `filterModifiedGt`.
- `calls.list`: `GET /calls` with optional `skip` (0–10000), `limit` (1–100), and `includePagination`.
- `calls.get`: `GET /call-details` with required `id` and optional `includeAudio` / `includeVideo`.
- `scorecards.list`: `GET /scorecard` with optional skip/limit and scorer filters.

Successful responses are raw provider JSON under AppCall `data`. Array call filters, CRM endpoints, writes, and the deprecated `rest-api.trywingman.com` host are omitted.

## Adaptations

Pinned source and official docs agree on `https://rest-api.copilot.clari.com` and dual `X-Api-Key` / `X-Api-Password` headers. Native category is `crm` (source Data is not in the Rust CATEGORIES allowlist). Dual-header auth uses `http.auth` for the key and `http.headers` for `X-Api-Password={{apiPassword}}`. Native returns raw JSON under `data`. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://api-doc.copilot.clari.com/. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
