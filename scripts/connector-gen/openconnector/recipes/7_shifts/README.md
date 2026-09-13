# 7shifts

Read-only international **7shifts REST API v2** access-token recipe. Create a long-lived access token under Company Settings → Developer Tools and store it as `apiKey`. Requests send `Authorization: Bearer <token>` and `Accept: application/json` to `https://api.7shifts.com`.

## Operations

- `healthcheck`: `GET /v2/whoami` with empty input (official first-call probe; pinned credential validator).
- `identity.get`: same `GET /v2/whoami` with optional `apiVersion` (`x-api-version`).
- `companies.list`: `GET /v2/companies` with optional `modified_since` and `apiVersion`.
- `companies.get`: `GET /v2/companies/{id}`; `id` is a required integer.
- `locations.list`: `GET /v2/company/{company_id}/locations`; required `company_id`, optional `modified_since`, `deleted`, `cursor`, `limit` (1–500), and `apiVersion`.

Successful responses are raw provider JSON under AppCall `data`. Writes, departments/roles/users, and OAuth partner clients are omitted.

## Adaptations

Official access-token docs: no headers besides `Authorization` are required; tokens carry a default API version when `x-api-version` is omitted. Native sends `x-api-version` only when `apiVersion` is supplied. `x-company-guid` is OAuth-partner-only and is omitted. Native category is `scheduling` (source Productivity is not the best allowlist match). Native returns raw JSON under `data` instead of the pinned camelCase wrappers. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
