# quipteams

Read-only international **quipteams REST API v1** recipe. quipteams is a global IT device lifecycle platform (procurement, delivery, retrieval, storage) founded in Argentina.

## Setup

Create an API key from company settings (`qk_live_...` production or `qk_test_...` sandbox). Store it as `apiKey`. Requests send `Authorization: Bearer <key>` and `Accept: application/json` to `https://api.quipteams.com`.

## Operations

- `healthcheck`: `GET /api/v1/products?include_inactive=false` with empty input (cheap catalog probe; pinned credential validator).
- `products.list`: `GET /api/v1/products` with optional `product_type`, `brand`, `search`, and `include_inactive`.
- `quotes.list`: `GET /api/v1/quotes` with optional `status`, `country`, `limit` (1–100), and `cursor`.
- `quotes.get`: `GET /api/v1/quotes/{id}`; `id` is the quote order_id.
- `employees.list`: `GET /api/v1/employees` with optional `status`, `search`, `limit` (1–100), and `cursor`.

Successful responses are raw provider JSON under AppCall `data`. Writes, webhooks, device actions, kits, and spec filters (cpu/ram/storage) are omitted.

## Adaptations

Pinned source and official docs agree on `https://api.quipteams.com` and Bearer auth. Native category is `productivity` (source Data is not in native CATEGORIES). Healthcheck uses the product-catalog probe rather than a billable search.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
