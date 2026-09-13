# Truvera

Read-only international Truvera API recipe (Dock Labs AG). Copy the API key from Truvera Workspace and set `host` to `api-testnet` (`api-testnet.truvera.io`) or `api` (`api.truvera.io`). Match the host to where the key was created. The runner sends `Authorization: Bearer <API key>` plus `Accept: application/json`.

## Operations

- `healthcheck`: `GET /data/profile` with empty input (pinned credential validator; OpenAPI “Gets your user profile”).
- `dids.list`: `GET /dids` with optional `offset`, `limit` (1–64), and `type` (`cheqd` | `dock` | `key`).
- `dids.get`: `GET /dids/{did}`.
- `schemas.list`: `GET /schemas` with optional `offset` and `limit`.
- `schemas.get`: `GET /schemas/{schemaId}`.

DID/schema creates and deletes, jobs, and credential issuance are omitted. Native returns raw Truvera JSON under `data` (list endpoints are JSON arrays).

## Adaptations

Pinned source and official OpenAPI agree on Bearer auth and the two hosts. Required stored `host` interpolates `https://{{host}}.truvera.io` with allowlisted `api-testnet.truvera.io` and `api.truvera.io`. Pinned source defaults an omitted `apiBaseUrl` to testnet; native requires the stored host. Native category is `dev-tools` (source Security is not in the Rust CATEGORIES allowlist). The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://docs.truvera.io/truvera-api/getting-started and https://swagger-api.truvera.io/openapi.yaml. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
