# Griptape

Read-only international **Griptape Cloud API** recipe. Create an API key at https://cloud.griptape.ai/configuration/api-keys and store it as `apiKey`. Requests send `Authorization: Bearer` and `Accept: application/json` to `https://cloud.griptape.ai/api`.

## Operations

- `healthcheck`: `GET /organizations` (cheap authenticated organization list; pinned credential validator).
- `organizations.get`: `GET /organizations/{organization_id}`.
- `assistants.list`: `GET /assistants` with optional `page` (>=1) and `page_size` (1–100).
- `assistants.get`: `GET /assistants/{assistant_id}`.
- `assistant-runs.get`: `GET /assistant-runs/{assistant_run_id}`.

Successful responses are raw Griptape JSON under AppCall `data`. Writes, run creation, and event streams are omitted.

## Adaptations

Native category is `dev-tools` (source AI is not in the Rust CATEGORIES allowlist). Responses keep raw Cloud JSON under `data` instead of the source `{organizations, raw}` wrappers. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://docs.griptape.ai/stable/griptape-cloud/api/api-reference/. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
