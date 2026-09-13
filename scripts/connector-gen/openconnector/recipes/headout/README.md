# Headout

Read-only international **Headout public API v1** recipe. Sign up on the official affiliate platform to receive a production API key by email and store it as `apiKey`. Requests send `Headout-Auth` and `Accept: application/json` to `https://www.headout.com/api/public/v1`.

## Operations

- `healthcheck`: `GET /booking?limit=1` with empty input (cheap authenticated probe; pinned credential validator).
- `bookings.list`: `GET /booking` with optional `offset` (non-empty string) and `limit` (≥1).
- `bookings.get`: `GET /booking/{bookingId}`; `bookingId` is required.
- `cities.list`: `GET /city` with optional `offset` and `limit`.
- `products.get`: `GET /product/get/{productId}` with required `productId` and optional `currencyCode`, `language`, and `fetchVariants` (query `fetch-variants`).

Successful responses are raw provider JSON under AppCall `data`. Booking writes are omitted.

## Adaptations

Production host is pinned to `www.headout.com`. Pinned source selects `sandbox.api.test-headout.com` when the key starts with `tk_`; computed hosts are unsupported, so sandbox keys are omitted. Native category is `ecommerce` (source Productivity/Data are not in the Rust CATEGORIES allowlist). Returns raw Headout JSON instead of the upstream normalized objects. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official partner docs plus pinned source and are fixture-only; live smoke is unverified.
