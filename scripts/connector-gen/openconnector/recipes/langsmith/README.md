# LangSmith

Read-only international **LangSmith Cloud US SaaS** recipe. Create a PAT or workspace-scoped service key from Settings > API Keys and store it as `apiKey`. Requests send `X-Api-Key` and `Accept: application/json` to `https://api.smith.langchain.com`.

## Operations

- `healthcheck`: `GET /api/v1/workspaces` with empty input (cheap authenticated list; pinned credential validator).
- `workspaces.list`: `GET /api/v1/workspaces` with optional `include_deleted` and `data_plane_id`.
- `projects.list`: `GET /api/v1/sessions` with optional `name`, `name_contains`, `include_stats`, `sort_by_desc`, `offset` (≥0), and `limit` (1–100).
- `projects.get`: `GET /api/v1/sessions/{projectId}` with required `projectId` and optional `include_stats`.
- `datasets.list`: `GET /api/v1/datasets` with optional `name`, `name_contains`, `data_type` (`kv`, `llm`, `chat`), `offset`, and `limit` (1–100).

Successful responses are raw provider JSON under AppCall `data` (workspace/project/dataset lists are JSON arrays). Writes, examples, EU/APAC/AWS regional hosts, and self-hosted LangSmith are omitted.

## Adaptations

Official default SaaS host is `https://api.smith.langchain.com` (GCP US). Pinned source computed EU/APAC/AWS hosts from an optional region field; native pins the documented US default because computed hosts are unsupported. Optional `X-Tenant-Id` is omitted; use a workspace-scoped key when the key can access more than one workspace. Native category is `dev-tools` (source AI/Developer Tools are not in the Rust CATEGORIES allowlist). Session/dataset `limit` maximum is 100 per official docs.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
