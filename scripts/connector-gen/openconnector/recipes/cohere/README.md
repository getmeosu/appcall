# Cohere

Read-only international **Cohere Platform API** recipe for `api.cohere.com`. Create an API key at [dashboard.cohere.com/api-keys](https://dashboard.cohere.com/api-keys) and store it as `apiKey`. Requests send `Authorization: Bearer <token>` plus `Accept: application/json`.

## Operations

- `healthcheck`: `GET /v1/models?page_size=1` (cheap authenticated model-list; same path and bound as the pinned credential validator).
- `models.list`: `GET /v1/models` with optional `page_size` (1-1000), `page_token`, and `endpoint`.
- `models.get`: `GET /v1/models/{modelId}`; `modelId` is required.

POST `/v2/chat`, `/v2/embed`, and `/v2/rerank` are omitted as billed completions. Successful responses are raw provider JSON under AppCall `data`.

## Adaptations

Pinned source and official docs agree on `https://api.cohere.com` and Bearer auth. Native category is `dev-tools` (source AI is not a native CATEGORY). Native omits the upstream user-agent. Model list/get are not named upstream actions; mappings reuse `chat` as the sibling. Healthcheck sends a literal `page_size=1` query to match the pinned validator.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified. Configure the API key, call `healthcheck` with `{}`, then `models.list`. Related April 2026 Terrarium sandbox coverage is recorded under the 2026-09-13 waiver and is not this API edition.
