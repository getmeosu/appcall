# Nyne.ai

Read-only international **Nyne.ai People Data API** recipe. Create an API key and secret at https://nyne.ai/api-keys and store them as `apiKey` and `apiSecret`. Requests send `X-API-Key`, `X-API-Secret`, and `Accept: application/json` to `https://api.nyne.ai`. Rate limits: 100/min, 1,000/hour.

## Operations

- `healthcheck`: `GET /usage` with empty input (documented free usage probe; pinned credential validator). Not a billed search submit.
- `usage.get`: `GET /usage` with optional `month` (1–12) and `year` (2020–2030).
- `person.search.get`: `GET /person/search?request_id=`; `requestId` is required. Status poll of an existing job.
- `person.enrichment.get`: `GET /person/enrichment?request_id=`; required `requestId`.
- `company.search.get`: `GET /company/search?request_id=`; required `requestId`.

Successful responses are raw provider JSON under AppCall `data`. Async submit POSTs, company enrichment poll, MCP OAuth, and writes are omitted.

## Adaptations

Pinned source and official docs agree on `https://api.nyne.ai` and dual `X-API-Key` / `X-API-Secret` headers. Native category is `crm` (source Data/Marketing are not in the Rust CATEGORIES allowlist). Dual-header auth uses `http.auth` for the key and `http.headers` for `X-API-Secret={{apiSecret}}`. Official query-string credential fallback is not used. Native returns raw JSON under `data` instead of the pinned camelCase wrappers. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
