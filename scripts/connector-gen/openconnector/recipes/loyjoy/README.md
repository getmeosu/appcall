# LoyJoy

Read-only international LoyJoy Cloud REST recipe. Create a tenant-scoped access token in LoyJoy Manager under Tenant Settings > API (`https://cloud.loyjoy.com/`). The runner sends `Authorization: Bearer {token}` and `Accept: application/json` to `https://app-stable.loyjoy.com/api`.

## Operations

- `healthcheck`: `GET /processes` with empty input (pinned credential validator).
- `processes.list`: `GET /processes`.
- `processes.get`: `GET /processes/{processId}`.
- `views.list`: `GET /views`.
- `views.get`: `GET /views/{viewId}`.

Process start, knowledge-chunk search, and completions are omitted. Native returns the raw JSON under `data` rather than the upstream `{processes}` / `{process}` / `{views}` / `{view}` wrappers.

## Adaptations

Public HTML REST catalog for `/api/processes` was not published; request paths follow pinned source plus MCP/manager token docs. Pipedream's example probe uses `/api/process-definition`. Native category is `messaging` (source AI/Communication are not in the Rust CATEGORIES allowlist; LoyJoy is a conversational-agent platform). The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://docs.loyjoy.com/docs/agents/mcp/. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure an access token, call `healthcheck` with `{}`, then `processes.list`.
