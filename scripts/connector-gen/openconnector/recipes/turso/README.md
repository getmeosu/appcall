# Turso

Read-only international Turso Platform API recipe. Mint a Platform API token with `turso auth api-tokens mint <name>` (prefer `--org`). The runner sends `Authorization: Bearer <token>` plus `Accept: application/json` to `https://api.turso.tech`.

## Operations

- `healthcheck`: `GET /v1/auth/validate` with empty input (pinned credential validator).
- `organizations.list`: `GET /v1/organizations` (JSON array).
- `organizations.get`: `GET /v1/organizations/{organizationSlug}`.
- `locations.list`: `GET /v1/locations`.
- `databases.list`: `GET /v1/organizations/{organizationSlug}/databases`.

Group/database creates and deletes and SQL-engine tokens are omitted. Native returns raw Turso JSON under `data`.

## Adaptations

Pinned source and official docs agree on Bearer auth and `https://api.turso.tech`. Native category is `dev-tools` (source Developer Tools / Data). Optional database list filters (`group`, `schema`, `parent`) are omitted. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://docs.turso.tech/api-reference/authentication and https://docs.turso.tech/api-reference/tokens/validate. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
