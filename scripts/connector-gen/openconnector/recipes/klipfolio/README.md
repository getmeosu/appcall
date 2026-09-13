# Klipfolio

Read-only international **Klipfolio Klips API 1.0** recipe. Generate an API key from My Profile (or Users, with permission) and store it as `apiKey`. Requests send `kf-api-key` and `Accept: application/json` to `https://app.klipfolio.com/api/1.0`.

## Operations

- `healthcheck`: `GET /clients?limit=1` with empty input (cheap authenticated list; pinned credential validator).
- `clients.list`: `GET /clients` with optional `offset` and `limit` (1–100).
- `clients.get`: `GET /clients/{id}`; `id` is required and URI-encoded.
- `dashboards.list`: `GET /tabs` with optional `offset` and `limit` (1–100). Official docs still expose dashboards as tabs.
- `dashboards.get`: `GET /tabs/{id}`; `id` is required and URI-encoded.

Successful responses are raw provider JSON under AppCall `data`. Writes, Klips, and data-source operations are omitted.

## Adaptations

Official resource URLs use `https://app.klipfolio.com/api/1.0`. Pinned source used `api.klipfolio.com`; native follows the resource-URL host. Official dashboard resources are `/tabs`; pinned source used `/dashboards`. Native category is `productivity` (source Data is not in the Rust CATEGORIES allowlist). Pagination `limit` maximum is 100 per official docs.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
