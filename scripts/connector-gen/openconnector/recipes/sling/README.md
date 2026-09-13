# Sling

Read-only international Sling REST API v1 recipe (Toast-acquired employee scheduling at getsling.com). Configure the authorization token visible in Sling client request headers, or obtained via `POST /account/login`. The runner sends `Authorization` as the raw token (not Bearer) plus `Accept: application/json` to `https://api.getsling.com/v1`. Distinct from DISH Network's Sling TV.

## Operations

- `healthcheck`: `GET /account/session` with empty input (pinned credential validator).
- `users.list`: `GET /users` with optional `query` and `includeDeleted`.
- `groups.list`: `GET /groups` with optional `type`.
- `shifts.current`: `GET /shifts/current`.
- `tasks.list`: `GET /tasks` with optional `filter`, `since`, `before`, and `pageSize` (wire name `pagesize`).

Writes, calendar fanout, coworker lists, and comma-separated `ids` filters are omitted. Native returns raw Sling JSON under `data`.

## Adaptations

Pinned source and official OpenAPI agree on `https://api.getsling.com/v1` and a raw `Authorization` token. Native category is `scheduling` (source Productivity maps here). `ids` array filters are omitted because native query templates would emit repeated keys instead of the source comma-join. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://api.getsling.com/ and https://api.getsling.com/v1/spec.json. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
