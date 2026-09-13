# Attio

Read-only international **Attio REST API** recipe. Generate a workspace access token (API key) from the Attio developer settings and store it as `accessToken`. Requests send `Authorization: Bearer` and `Accept: application/json` to `https://api.attio.com`. OAuth is documented by Attio but is not used in this recipe.

## Operations

- `healthcheck`: `GET /v2/self` (cheap authenticated identify; same path as the pinned credential validator).
- `objects.list`: `GET /v2/objects`.
- `objects.get`: `GET /v2/objects/{object}`.
- `records.list`: `POST /v2/objects/{object}/records/query` with optional `filter`, `filterViewId` (`filter_view_id`), `sorts`, `limit`, and `offset`.
- `records.get`: `GET /v2/objects/{object}/records/{recordId}`.

Successful responses are raw provider JSON under AppCall `data`. Record create/upsert/update/delete and attribute listing are omitted.

## Adaptations

Pinned source and official docs agree that workspace API keys and OAuth access tokens are both valid Bearer credentials. This recipe uses the access-token/api-key native shape (not OAuth-only). Native category is `crm` (source Productivity/Data; Data is not in the Rust CATEGORIES allowlist). Returns raw Attio JSON under `data` (`appcall-provider-json-v1`) rather than the original curated `preserve-existing` result mapping. Pinned user-agent is omitted.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
