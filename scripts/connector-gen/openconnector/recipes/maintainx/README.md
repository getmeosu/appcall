# MaintainX

Read-only international **MaintainX REST API v1** recipe. Generate an API key under Settings > Integrations > API Keys. Store it as `apiKey`. The runner sends `Authorization: Bearer` to `https://api.getmaintainx.com/v1`, plus `Accept: application/json`.

## Operations

- `healthcheck`: `GET /locations?limit=1` with empty input (cheap authenticated locations probe; pinned credential validator).
- `locations.list`: `GET /locations` with optional `cursor` and `limit` (1–200).
- `locations.get`: `GET /locations/{id}`; `id` is a required positive integer.
- `work-orders.list`: `GET /workorders` with optional `cursor` and `limit` (1–200).
- `users.list`: `GET /users` with optional `cursor` and `limit` (1–200).

Successful responses are raw provider JSON under AppCall `data`. Writes and multi-organization `x-organization-id` headers are omitted (single-org tokens). Provider next-page URLs are returned as data and never followed.

## Adaptations

Native category is `productivity` (CMMS/work orders; no maintenance CATEGORIES value). Optional filter arrays on work-order list are omitted. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
