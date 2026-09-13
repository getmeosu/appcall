# FireHydrant

Read-only international **FireHydrant REST API v1** recipe at `https://api.firehydrant.io/v1`. This is the US/global API, not `api.eu.firehydrant.io` or the read-only replica at `api-read.firehydrant.io`.

## Setup

Create an API key in FireHydrant under Settings → API Keys (Owner permission). Store it as `apiKey`. Requests send `Authorization: Bearer <token>` and `Accept: application/json`.

## Operations

- `healthcheck`: `GET /incidents?per_page=1` with empty input (matches the pinned credential probe).
- `incidents.list`: `GET /incidents` with optional `page`, `perPage` (1–200, sent as `per_page`), and `query`.
- `incidents.get`: `GET /incidents/{incidentId}`.
- `services.list`: `GET /services` with optional `page`, `perPage`, and `query`.
- `environments.list`: `GET /environments` with optional `page`, `perPage`, and `query`.

Successful responses are raw provider JSON under AppCall `data`. Incident create and other writes are omitted.

## Adaptations

Pinned source and official docs agree on host `https://api.firehydrant.io/v1` and Bearer API-key auth. Native GETs omit the upstream `content-type` and user-agent headers. `perPage` maps to query `per_page`.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
