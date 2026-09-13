# Airtable

Read-only international **Airtable Web API** recipe. Create a personal access token at https://airtable.com/create/tokens and store it as `apiKey`. Requests send `Authorization: Bearer` and `Accept: application/json` to `https://api.airtable.com`. OAuth is documented by Airtable but is not used in this recipe.

## Operations

- `healthcheck`: `GET /v0/meta/whoami` (cheap authenticated read; same path as the pinned credential validator).
- `bases.list`: `GET /v0/meta/bases` with optional `offset`.
- `bases.schema`: `GET /v0/meta/bases/{baseId}/tables`.
- `records.get`: `GET /v0/{baseId}/{tableIdOrName}/{recordId}`.

Successful responses are raw provider JSON under AppCall `data`. Writes and `list_records` (GET vs POST `/listRecords` computed from URL length) are omitted.

## Adaptations

Pinned source and official docs agree on PAT Bearer auth and `api.airtable.com`. Native category is `productivity` (source Productivity/Data; Data is not in the Rust CATEGORIES allowlist). Healthcheck uses the documented whoami path rather than list_bases.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
