# Moorcheh

Read-only international Moorcheh public REST recipe. Create an API key from the API Keys section at https://console.moorcheh.ai. The runner sends `x-api-key`, `Accept: application/json`, and `Content-Type: application/json` to `https://api.moorcheh.ai/v1`.

## Operations

- `healthcheck`: `GET /namespaces` with empty input (pinned credential validator).
- `namespaces.list`: `GET /namespaces`.
- `documents.fetch-text`: `GET /namespaces/{namespace_name}/documents/fetch-text-data` with optional `limit` (1–100) and `next_token`.
- `documents.get`: `POST /namespaces/{namespace_name}/documents/get` with JSON `{ids}` (1–100 identifiers).

Namespace create/delete, uploads, deletions, and semantic search are omitted. Healthcheck uses the namespace list rather than billable search. Native returns the raw JSON under `data`.

## Adaptations

Pinned source and official docs agree on `x-api-key` and `https://api.moorcheh.ai/v1`. Native category is `dev-tools` (source AI/Data are not in the Rust CATEGORIES allowlist; Moorcheh is a developer search/RAG API). The upstream user-agent is not sent. `Content-Type: application/json` is sent on GETs to match pinned source.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://docs.moorcheh.ai/api-reference/introduction. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure an API key, call `healthcheck` with `{}`, then `namespaces.list`.
