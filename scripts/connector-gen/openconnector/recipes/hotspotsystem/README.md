# HotspotSystem

International **HotspotSystem API v2.0** recipe plus the documented v1.0 generate-voucher call. Generate an API key from Control Center > Tools & Settings > API Keys. Store it as `apiKey`. The runner sends `sn-apikey` and `Accept: application/json` to `https://api.hotspotsystem.com/v2.0` (v1.0 host for `vouchers.generate`).

## Operations

- `healthcheck`: `GET /me` with empty input (Composio Get Me; pinned credential validator).
- `locations.list`: `GET /locations` with optional `fields`, `sort`, `limit` (≥1), and `offset` (≥0).
- `location-options.list`: `GET /locations/options`.
- `customers.list`: `GET /customers` with the same optional pagination query.
- `customers.list_by_location`: `GET /locations/{locationId}/customers`.
- `subscribers.list`: `GET /subscribers`.
- `subscribers.list_by_location`: `GET /locations/{locationId}/subscribers`.
- `vouchers.list`: `GET /vouchers`.
- `vouchers.list_by_location`: `GET /locations/{locationId}/vouchers`.
- `vouchers.generate`: v1.0 `GET /locations/{locationId}/generate/voucher.json` with optional `validity` and `package` (write; deducts voucher credits).
- `transactions.mac.list` / `transactions.mac.list_by_location`: `GET /transactions/mac` and the location-scoped variant.
- `transactions.voucher.list` / `transactions.voucher.list_by_location`: `GET /transactions/voucher`.
- `transactions.social.list` / `transactions.social.list_by_location`: `GET /transactions/social`.
- `transactions.paid.list` / `transactions.paid.list_by_location`: `GET /transactions/paid`.
- `ping`: `GET /ping` (Composio Misc Ping).

Successful responses are raw provider JSON under AppCall `data`. Pagination `Link` headers are not followed.

## Adaptations

Official sample curl uses `-H 'sn-apikey: ***'` on `https://api.hotspotsystem.com/v2.0`. Native category is `productivity` (source Communication is not in native CATEGORIES). The upstream user-agent is not sent. Responses keep raw HotspotSystem JSON under `data` instead of the source owner/locations/customers unwrap. Generate voucher uses documented API v1.0 because v2.0 has no generate route.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://www.hotspotsystem.com/apidocs/api/reference, https://www.hotspotsystem.com/apidocs/api/notes, and https://www.hotspotsystem.com/apidocs-v1. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
