# Goody

Read-only international **Goody production API** recipe at `https://api.ongoody.com`. This is production, not the sandbox host `api.sandbox.ongoody.com`.

## Setup

Create an API key from a Goody for Business account (Account → API Keys, or Organization → Commerce API for a commerce app). Store it as `apiKey`. Requests send `Authorization: Bearer <token>` and `Accept: application/json`.

## Operations

- `healthcheck`: `GET /v1/me` with empty input (documented auth check).
- `products.list`: `GET /v1/products` with optional `page`, `per_page` (1–100), `country_code` (minLength 2), and `use_custom_catalog`.
- `products.get`: `GET /v1/products/{id}` with optional `use_custom_catalog`.
- `orders.list`: `GET /v1/orders` with optional `page` and `per_page`.
- `workspaces.list`: `GET /v1/workspaces`.

Successful responses are raw provider JSON under AppCall `data`. Order creation and other writes are omitted.

## Adaptations

Pinned source and official docs agree on `https://api.ongoody.com` and Bearer auth. Native GETs omit the upstream user-agent. `created_at[after]` / `created_at[before]` order filters are omitted.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
