# GenPage

Read-only international **GenPage External API v1** recipe. Create a workspace-bound API token under Settings → Integrations (getting-started also names Settings → API Keys). Store it as `apiKey`. Requests send `Authorization: Bearer {{apiKey}}`, `Accept: application/json`, and `Content-Type: application/json` to `https://backend.genpage.ai`.

## Operations

- `healthcheck`: `GET /api/external/v1/workspaces/get-list` with empty input (cheap authenticated workspace probe; pinned credential validator). Official `GET /hello-world-user` is not a pinned upstream action and is not used.
- `campaigns.list`: `GET /api/external/v1/campaigns/get-list`; `workspaceId` is a required positive integer sent as `workspace_id`.
- `audiences.list`: `GET /api/external/v1/audiences/get-list` with the same required `workspaceId`.
- `workspace.variables.list`: `GET /api/external/v1/workspaces/get-variable-list` with the same required `workspaceId`.
- `credits.get`: `GET /api/external/v1/account/credits` with the same required `workspaceId` (balance read, not a billed generation).

Successful responses are raw provider JSON under AppCall `data`. List endpoints return JSON arrays. Campaign/audience writes, lead upserts, page generate/publish, and campaign analytics (PHP `campaign_ids[]` array query; pinned source comma-joins) are omitted. OAuth 2.1 MCP tokens are omitted.

## Adaptations

Pinned source and official docs agree on `https://backend.genpage.ai` and Bearer tokens. Native category is `crm` (source Marketing/Data are not in the Rust CATEGORIES allowlist). Official GET examples send `Content-Type: application/json`; native does too. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
