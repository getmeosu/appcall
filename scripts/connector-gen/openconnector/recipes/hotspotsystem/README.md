# HotspotSystem

Read-only international **HotspotSystem API v2.0** recipe. Generate an API key from Control Center > Tools & Settings > API Keys. Store it as `apiKey`. The runner sends `sn-apikey` and `Accept: application/json` to `https://api.hotspotsystem.com/v2.0`.

## Operations

- `healthcheck`: `GET /me` with empty input (cheap authenticated operator read; pinned credential validator).
- `locations.list`: `GET /locations` with optional `fields`, `sort`, `limit` (≥1), and `offset` (≥0).
- `location-options.list`: `GET /locations/options`.
- `customers.list`: `GET /customers` with the same optional pagination query.
- `subscribers.list`: `GET /subscribers` with the same optional pagination query.

Successful responses are raw provider JSON under AppCall `data`. Location-scoped lists, vouchers, transactions, and writes are omitted. Pagination `Link` headers are not followed.

## Adaptations

Official sample curl uses `-H 'sn-apikey: ***'` on `https://api.hotspotsystem.com/v2.0`. Native category is `productivity` (source Communication is not in native CATEGORIES). The upstream user-agent is not sent. Responses keep raw HotspotSystem JSON under `data` instead of the source owner/locations/customers unwrap.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://www.hotspotsystem.com/apidocs/api/reference and https://www.hotspotsystem.com/apidocs/api/notes. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
