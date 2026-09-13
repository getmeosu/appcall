# Jumpseller

Read-only international **Jumpseller API v1** recipe. Store owners find API Login and Auth Token in the admin Account sidebar. Store login as `login` (non-secret) and the auth token as `apiKey`. The runner sends HTTP Basic authentication with login as username and the auth token as password to `https://api.jumpseller.com/v1`, plus `Accept: application/json`.

## Operations

- `healthcheck`: `GET /store/info.json` with empty input (cheap authenticated store probe; pinned validator uses the same path with a fields projection, which native healthcheck omits).
- `products.list`: `GET /products.json` with optional 1-indexed `page` and `limit` (1–100).
- `products.get`: `GET /products/{id}.json`; `id` is a required positive integer.
- `orders.list`: `GET /orders.json` with the same optional page filters.
- `orders.get`: `GET /orders/{id}.json`; `id` is a required positive integer.

Successful responses are raw provider JSON under AppCall `data`. List endpoints typically return a JSON array. Search, writes, status-filtered order paths, locale/fields projection, deprecated query credentials, and OAuth app tokens are omitted.

## Adaptations

Pinned source and official docs agree on `https://api.jumpseller.com/v1` and Basic `login:authtoken`. Native Basic uses `http.auth.basic` rather than a handwritten header. Native category is `ecommerce` (source Marketing/Data are not in the Rust CATEGORIES allowlist). Status-filtered `/orders/status/{status}.json` is omitted because the native path cannot express that computed route. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
