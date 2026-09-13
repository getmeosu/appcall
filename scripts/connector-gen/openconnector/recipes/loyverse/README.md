# Loyverse

Read-only international **Loyverse API v1.0** recipe. Create a personal access token in Loyverse Back Office integrations and store it as `apiKey`. Requests send `Authorization: Bearer <token>` and `Accept: application/json` to `https://api.loyverse.com/v1.0`.

OAuth authorization-code tokens are a separate third-party app edition and are omitted.

## Operations

- `healthcheck`: `GET /merchant/` with empty input (pinned credential probe, including the trailing slash).
- `stores.list`: `GET /stores` with optional `limit` (1–250) and `cursor`.
- `stores.get`: `GET /stores/{id}`.
- `items.list`: `GET /items` with optional `limit` and `cursor`.
- `items.get`: `GET /items/{id}`.

Successful responses are raw Loyverse JSON under AppCall `data`. Cursor pagination is caller controlled. Receipts, customers, categories, writes, and ID-list filters are omitted.

HTTP 200 bodies with a populated `errors` array are treated as failures via native `http.errors.bodyErrorPaths`.

## Adaptations

Pinned source uses `GET /merchant/` with a trailing slash; native keeps that path. Native category is `ecommerce` (source Finance/Data are not in the Rust CATEGORIES allowlist). The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
