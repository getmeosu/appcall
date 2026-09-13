# AlgoDocs

Read-only international AlgoDocs REST API v1 recipe. Copy the secret API key from https://app.algodocs.com/restapi. The runner sends `x-api-key` plus `Accept: application/json` to `https://api.algodocs.com`.

## Operations

- `healthcheck`: `GET /v1/me` with empty input (official health-check and pinned credential validator).
- `extractors.list`: `GET /v1/extractors`.
- `folders.list`: `GET /v1/folders`.
- `extracted-data.get`: `GET /v1/extracted_data/{documentId}`.
- `extracted-data.list`: `GET /v1/extracted_data/{extractorId}` with optional `folderId`, `limit`, and `date` (`YYYY-MM-DDTHH:MM:SS`).

Document upload is omitted (multipart). Native returns raw JSON under `data`. Native category is `productivity` (source Productivity / Data).

## Adaptations

Pinned source and official docs agree on `x-api-key` and `GET /v1/me`. Official list-extracted-data query is `folderId`; pinned source sent `folder_id`. Native follows the official name. The upstream user-agent is not sent. Raw arrays are returned under `data` instead of `{extractors|folders|records, raw}` wrappers.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://api.algodocs.com/. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
