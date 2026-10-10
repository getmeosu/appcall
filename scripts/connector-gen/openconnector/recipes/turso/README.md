# Turso

International Turso Platform API recipe. Mint a Platform API token with `turso auth api-tokens mint <name>` (prefer `--org`). The runner sends `Authorization: Bearer <token>` plus `Accept: application/json` to `https://api.turso.tech`.

## Operations

- `healthcheck`: `GET /v1/auth/validate`.
- Organizations: list, get, update.
- `locations.list`: `GET /v1/locations`.
- Databases: list, get, create, delete, usage, stats, configuration, createToken.
- Groups: list, get, create, delete.
- `members.list`, `tokens.list`, `auditLogs.list`, `user.get`.

Turso has no vendor webhook catalog on the Platform API, so EventOnly webhook ops are omitted. Native returns raw Turso JSON under `data`.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://docs.turso.tech/api-reference/introduction. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
