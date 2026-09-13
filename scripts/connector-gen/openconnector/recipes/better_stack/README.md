# Better Stack

Read-only international Better Stack Uptime API recipe. Configure a global or team Uptime API token from Better Stack → API tokens. The runner sends `Authorization: Bearer` plus `Accept: application/json` to `https://uptime.betterstack.com`. Logs/telemetry hosts are a different edition and are not allowlisted.

## Operations

- `healthcheck`: `GET /api/v3/incidents?per_page=1` with empty input (pinned credential validator).
- `incidents.list`: `GET /api/v3/incidents` with optional `team_name`, `from`, `to`, `monitor_id`, `heartbeat_id`, `resolved`, `acknowledged`, `page`, and `per_page` (max 50).
- `incidents.get`: `GET /api/v3/incidents/{incident_id}`.
- `comments.list`: `GET /api/v2/incidents/{incident_id}/comments`.
- `metadata.list`: `GET /api/v3/metadata` with optional `team_name`, `owner_id`, `owner_type`, `page`, and `per_page`.

Create/acknowledge/escalate/resolve writes and nested metadata query filters are omitted. Native category is `dev-tools` (source Developer Tools).

## Adaptations

Pinned source and official Uptime docs agree on Bearer tokens at `uptime.betterstack.com`. Comments remain on the documented v2 path. Native returns raw Better Stack JSON under `data`. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://betterstack.com/docs/uptime/api/getting-started-with-uptime-api/. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
