# Anthropic

Read-only international **Anthropic API** recipe for `api.anthropic.com`. Create an API key in the Anthropic Console (API keys) and store it as `apiKey`. Requests send `x-api-key`, `anthropic-version: 2023-06-01`, `Accept: application/json`, and `Content-Type: application/json`.

## Operations

- `healthcheck`: `GET /v1/models` (cheap authenticated model-list; same path as the pinned credential validator).
- `models.list`: `GET /v1/models` with optional `before_id`, `after_id`, and `limit` (1–1000).
- `models.get`: `GET /v1/models/{model_id}`; `model_id` is required.

`POST /v1/messages` and `POST /v1/messages/count_tokens` are omitted as billed completions. Successful responses are raw provider JSON under AppCall `data`.

## Adaptations

Pinned source and official docs agree on `https://api.anthropic.com`, `x-api-key`, and `anthropic-version: 2023-06-01`. Native category is `dev-tools` (source AI is not in the Rust CATEGORIES allowlist). Native omits the upstream user-agent. Content-Type is sent on GET to match the pinned executor and official required-header table.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified. Configure the API key, call `healthcheck` with `{}`, then `models.list`. Historical non-China incidents (Claude Code source map; eval-harness third-party access) are recorded under the 2026-09-13 waiver.
