# Clockify

International Clockify Cloud API v1 recipe covering the Composio CLOCKIFY toolkit (75 indexed tools, 76 documented slugs). Generate an API key in Clockify Preferences → Advanced → API and store it as `apiKey`. Requests send `X-Api-Key` plus `Accept: application/json` to `https://api.clockify.me/api/v1`. Reports use `https://reports.api.clockify.me/v1`.

## Operations

Origin/main four operations are retained:

- `healthcheck`: `GET /user` (CLOCKIFY_GET_CURRENTLY_LOGGED_IN_USER_INFO).
- `workspaces.list`: `GET /workspaces` (CLOCKIFY_GET_ALL_MY_WORKSPACES).
- `projects.list`: `GET /workspaces/{workspaceId}/projects` (CLOCKIFY_GET_PROJECTS).
- `tasks.list`: `GET /workspaces/{workspaceId}/projects/{projectId}/tasks` (CLOCKIFY_GET_TASKS).

The remaining Composio CLOCKIFY tools are request-backed actions on the same Cloud hosts (clients, tags, tasks, time entries, user groups, webhooks, templates, holidays, assignments, shared reports, and Reports API). Recipe operations equal runner operations.

## Adaptations

Pinned source and official docs agree on `https://api.clockify.me/api/v1` and `X-Api-Key`. Native pins that Cloud host plus `reports.api.clockify.me` for report endpoints. Self-hosted, Enterprise subdomain, and region hosts (`euc1` / `euw2` / `use2` / `apse2.clockify.me`) are not expressed. `pageSize` and `page-size` both map to query `page-size`.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://docs.clockify.me/. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
