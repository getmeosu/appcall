# Cockroach Labs

Read-only international **CockroachDB Cloud API v1** (`2024-09-16`) recipe. Create a service-account secret key in the CockroachDB Cloud console and store it as `apiKey`. Requests send `Authorization: Bearer <key>`, `Accept: application/json`, and `Cc-Version: 2024-09-16` to `https://cockroachlabs.cloud`.

## Operations

- `healthcheck`: `GET /api/v1/organization` with empty input (cheap authenticated organisation probe; pinned credential validator).
- `clusters.list`: `GET /api/v1/clusters` with optional `showInactive` (`show_inactive`), `page`, `limit`, `sortOrder`, and `sortBy`.
- `clusters.get`: `GET /api/v1/clusters/{clusterId}`.
- `regions.list`: `GET /api/v1/clusters/available-regions` with optional `provider` (`GCP`/`AWS`/`AZURE`), `serverless`, `page`, `limit`, and `sortOrder`.

Successful responses are raw provider JSON under AppCall `data`. Cluster create/update/delete, node/database/SQL-user lists, and other writes are omitted.

## Adaptations

Pinned source and official docs agree on `https://cockroachlabs.cloud`, Bearer auth, and `Cc-Version: 2024-09-16`. Native category is `dev-tools` (source Developer Tools/Data; Data is not in the Rust CATEGORIES allowlist). Healthcheck uses `GET /api/v1/organization` rather than a cluster search. Pagination query names follow pinned source (`pagination.page`, `pagination.limit`, …). The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://www.cockroachlabs.com/docs/cockroachcloud/cloud-api. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
