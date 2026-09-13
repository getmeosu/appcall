# JobNimbus

Read-only international **JobNimbus Open API** recipe for the contractor CRM at [jobnimbus.com](https://www.jobnimbus.com). JobNimbus is a Lehi, Utah company. This is the Open API at `https://app.jobnimbus.com/api1`, not the newer Platform API at `https://api.jobnimbus.com`.

## Setup

Create an API key in JobNimbus under Settings > API Keys and store it as `apiKey`. Requests send `Authorization: Bearer <apiKey>` and `Accept: application/json`.

## Operations

- `healthcheck`: `GET /contacts?size=1` with empty input (cheap authenticated list probe). The pinned credential validator uses `GET /account/settings`, which is not a `defineProviderAction`.
- `contacts.list`: `GET /contacts` with optional `size` (1–1000) and `from` (zero-based offset).
- `contacts.get`: `GET /contacts/{contactId}`; the ID is percent-encoded as one path segment.
- `jobs.list`: `GET /jobs` with the same optional pagination.
- `jobs.get`: `GET /jobs/{jobId}`.

Successful responses are raw provider JSON under AppCall `data`. List endpoints return `{ count, results }`. Writes, Elasticsearch-style `filter` JSON encoding, `fields` comma-join, `actor`, and sort are omitted.

## Adaptations

Official support still documents the Open API Postman collection (`https://app.jobnimbus.com/api1`, Bearer token, `size`/`from`). The Platform API authorization page uses `https://api.jobnimbus.com/{service}/v1/{endpoint}`, a different surface; this recipe keeps the Open API host and paths that the pinned source implements.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
