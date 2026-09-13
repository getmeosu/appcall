# Clockify

Read-only international Clockify Cloud API v1 recipe. Generate an API key in Clockify Preferences → Advanced → API and store it as `apiKey`. Requests send `X-Api-Key` plus `Accept: application/json` to `https://api.clockify.me/api/v1`.

## Operations

- `healthcheck`: `GET /user` with empty input (pinned credential validator).
- `workspaces.list`: `GET /workspaces`.
- `workspaces.get`: `GET /workspaces/{workspaceId}`.
- `projects.list`: `GET /workspaces/{workspaceId}/projects` with required `workspaceId` and optional `name`, `page`, `pageSize`, `archived`, `billable`.
- `projects.get`: `GET /workspaces/{workspaceId}/projects/{projectId}` with optional `hydrated`.

Writes, time-entry mutations, and reports are omitted. Native returns raw Clockify JSON under `data`. Native category is `productivity`.

## Adaptations

Pinned source and official docs agree on `https://api.clockify.me/api/v1` and `X-Api-Key`. Native pins that Cloud host; self-hosted, Enterprise subdomain, and region hosts (`euc1` / `euw2` / `use2` / `apse2.clockify.me`) are not expressed. Native omits the upstream user-agent. `pageSize` maps to query `page-size`.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://docs.clockify.me/. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
