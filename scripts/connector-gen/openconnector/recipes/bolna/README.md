# Bolna

Read-only international **Bolna Voice AI API** recipe. Bolna is a YC F25 voice-agent platform.

## Setup

Create an API key from the Bolna dashboard under Developers. Store it as `apiKey`. Requests send `Authorization: Bearer <key>` and `Accept: application/json` to `https://api.bolna.ai`.

## Operations

- `healthcheck`: `GET /user/me` with empty input (cheap authenticated user read; pinned credential validator).
- `agents.list`: `GET /v2/agent/all` (raw JSON array under `data`).
- `agents.get`: `GET /v2/agent/{agent_id}`; `agent_id` is required.
- `executions.list`: `GET /v2/agent/{agent_id}/executions` with required `agent_id` and optional `page_number` (1–9999) and `page_size` (1–50).
- `executions.get`: `GET /executions/{execution_id}`; `execution_id` is required.

Successful responses are raw provider JSON under AppCall `data`. Call placement writes, raw logs, and paired `from`/`to` date filters are omitted.

## Adaptations

Pinned source and official docs agree on `https://api.bolna.ai` and Bearer auth. Native category is `messaging` (source AI/Communication are not in the Rust CATEGORIES allowlist). Returns raw Bolna JSON instead of the upstream `{user}`/`{agents}` wrappers.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.

## Composio coverage (0.2.0)

Prepared tree adds the remaining Composio BOLNA tools as real HTTP operations on `https://api.bolna.ai`:

- Agents: create, update (PUT v2), delete, stop queued calls, copy, import, template create, deprecated v1 get/patch, paginated v1 list.
- Calls / executions: POST `/call`, GET `/agent/{agent_id}/execution/{execution_id}`. Origin `executions.list` gained optional Composio filters.
- Batches: list/get/schedule/stop/delete plus handwritten multipart create.
- Knowledgebases: list/get/delete plus handwritten multipart create (URL or PDF).
- Providers, phone numbers, inbound setup, voices (`GET /api/v1/voice-config/tts/voices` requires `provider_id` + `model_id`).
- `users.me` is BOLNA_GET_USER_INFO (same GET `/user/me` as healthcheck).

`batches.create` and `knowledgebases.create` are handwritten FormData handlers. Recipe operations equal runner operations.
