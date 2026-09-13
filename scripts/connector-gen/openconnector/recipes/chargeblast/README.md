# Chargeblast

Read-only international **Chargeblast REST API** recipe. Copy an API key from Chargeblast developer settings (`https://app.chargeblast.com/settings/developer`) and store it as `apiKey`. Requests send `X-API-Key` and `Accept: application/json` to `https://api.chargeblast.com`.

## Operations

- `healthcheck`: `GET /api/v2/merchants?per=1` with empty input (cheap authenticated probe; pinned credential validator).
- `merchants.list`: `GET /api/v2/merchants` with optional `page` (≥0) and `per` (1–100).
- `alerts.list`: `GET /api/v2/alerts` with optional `filter`, `page` (≥0), and `per` (1–100).
- `alerts.get`: `GET /api/v2/alert/{id}`; `id` is required.
- `orders.list`: `GET /api/v2/orders` with optional `page` and `per`.
- `orders.get`: `GET /api/v2/orders/{id}`; `id` is required.

Successful responses are raw provider JSON under AppCall `data`. Alert updates, credit requests, order uploads, and GET-with-JSON-body deflection logs are omitted.

## Adaptations

Pinned source and official docs agree on `https://api.chargeblast.com` and the `X-API-Key` header. Native category is `payments` (source Finance/Data are not in the Rust CATEGORIES allowlist). Healthcheck uses the validator's `/api/v2/merchants?per=1` rather than a search. List-alerts stays on documented legacy v2 `filter` to match pinned source; official new integrations prefer v3 `GET /api/v3/alerts` with `filter[type]`. Native GETs send `Accept` only; pinned source also sets `content-type: application/json` on every request. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
