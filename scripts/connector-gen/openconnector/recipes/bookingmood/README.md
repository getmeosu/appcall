# Bookingmood

Read-only **Bookingmood API v1** recipe at `https://api.bookingmood.com/v1`. This is the managed Amsterdam Cloud API documented by Bookingmood, not a caller-supplied host.

## Setup

Create an API key from the organization settings page in the Bookingmood admin dashboard. Store it as `apiKey`. Requests send `Authorization: Bearer` and `Accept: application/json`.

## Operations

- `healthcheck`: `GET /products?select=id,name&limit=1` with empty input (pinned credential probe).
- `products.list`: `GET /products` with optional `select`, `limit`, `offset`, `order`, `id`, and `organization_id`.
- `bookings.list`: `GET /bookings` with optional `select`, `limit`, `offset`, `order`, `id`, `organization_id`, and `product_id`.
- `availability.get`: `GET /availability` with required `product_id` and optional `start`/`end`.

Successful responses are raw provider JSON under AppCall `data`. Search, book, and other writes are omitted.

## Adaptations

Pinned source sends filter values as raw query params rather than PostgREST `eq.` operators. Native defaults omitted `select` to `*`; this template omits the query param when the caller does not pass `select`. Official availability docs list `product_ids`; documented curl and pinned source use `product_id`. Native GETs omit the upstream user-agent. Native category is `scheduling` (source Productivity).

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
