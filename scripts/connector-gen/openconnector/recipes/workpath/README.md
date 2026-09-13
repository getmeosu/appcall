# Workpath

Read-only international Workpath Connect API v3 recipe. Create an API client under Workpath Organization Settings > API Clients and store the token. The runner sends `Authorization: Bearer` plus `Accept: application/json` to `https://connect.workpath.com/api/v3`.

## Operations

- `healthcheck`: `GET /users` with empty input (pinned credential validator).
- `users.list`: `GET /users` with optional `page`.
- `users.get`: `GET /users/{id}`.
- `teams.list`: `GET /teams` with optional `page`.
- `goals.list`: `GET /goals` with optional `page`.

Goal/user/team writes, key-result convenience endpoints, and `start_date`/`end_date` pair filters are omitted. Native returns raw JSON under `data` (arrays for lists, objects for gets) rather than the upstream `{users|teams|goals, pagination}` wrapper.

## Adaptations

Public REST HTML for `connect.workpath.com/api/v3` was not independently hosted; paths follow pinned source plus the product Connect API mention. Pinned source sends `Content-Type` on GET and maps pagination headers; native omits both. The upstream user-agent is not sent. Native category is `productivity`.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Operator: Workpath GmbH, Munich. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure an API token, call `healthcheck` with `{}`, then `users.list` with `{}`.
