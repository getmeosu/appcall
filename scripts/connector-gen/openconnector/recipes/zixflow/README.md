# Zixflow

Read-only international Zixflow REST API v1 recipe. Create an API key under Workspace Settings > Developer > API Keys. The runner sends `Authorization: Bearer` plus `Accept: application/json` to `https://api.zixflow.com/api/v1`.

## Operations

- `healthcheck`: `GET /workspace-members` with empty input (pinned credential validator).
- `collections.list`: `GET /collections`.
- `collections.get`: `GET /collections/{collectionId}`.
- `lists.list`: `GET /lists`.
- `lists.get`: `GET /lists/{listId}`.

Collection-record / list-entry query POSTs and writes are omitted. Native returns the raw `{status,message,data}` envelope under `data`. Native category is `crm` (source Marketing/Productivity; Zixflow is a CRM).

## Adaptations

Official unauthorized examples are HTTP 401 with `{status:false,message:...}`. Native uses HTTP status. Pinned source additionally rejects HTTP 200 `status:false`, which native cannot express because boolean `false` does not trip `bodyErrorPaths` and success messages are non-empty strings. Zixflow AI `x-api-key` hosts are a different API. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://docs.zixflow.com/api-reference/introduction. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure an API token, call `healthcheck` with `{}`, then `collections.list` with `{}`.
