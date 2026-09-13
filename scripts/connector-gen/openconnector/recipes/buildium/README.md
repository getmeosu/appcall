# Buildium

Read-only international **Buildium Open API** recipe. Create API keys under Settings → API Keys (or Developer Tools). Store the client secret as `apiKey` and the client ID as `clientId`. Requests send `x-buildium-client-secret`, `x-buildium-client-id`, and `Accept: application/json` to `https://api.buildium.com`.

## Operations

- `healthcheck`: `GET /v1/rentals?limit=1` with empty input (official connectivity probe; pinned credential validator).
- `properties.list`: `GET /v1/rentals` with optional `limit` (1–1000), `offset`, and `orderBy` (`orderby`).
- `properties.get`: `GET /v1/rentals/{propertyId}`; `propertyId` is a required positive integer.
- `units.list`: `GET /v1/rentals/units` with the same optional pagination/sort fields.
- `units.get`: `GET /v1/rentals/units/{unitId}`; `unitId` is required.
- `owners.list`: `GET /v1/rentals/owners` with the same optional pagination/sort fields.

Successful responses are raw provider JSON under AppCall `data`. Writes and property-notes listing are omitted.

## Adaptations

Pinned source and official docs agree on `https://api.buildium.com` and the dual client headers. Native uses `http.auth` for `x-buildium-client-secret` (setup `apiKey`, matching pinned `apiKey=clientSecret`) plus `http.headers` `x-buildium-client-id={{clientId}}`. Native category is `productivity` (source Data is not in the Rust CATEGORIES allowlist). Array filters (`propertyids`, `unitids`, `rentalownerids`) are omitted because native query templates cannot comma-join arrays. Native returns raw JSON arrays/objects under `data` instead of the pinned `{count,items}` wrapper. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
