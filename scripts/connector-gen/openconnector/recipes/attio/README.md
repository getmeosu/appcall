# Attio

International **Attio REST API** recipe covering Composio ATTIO tools. Generate a workspace access token (API key) from the Attio developer settings and store it as `accessToken`. Requests send `Authorization: Bearer` and `Accept: application/json` to `https://api.attio.com`. OAuth is documented by Attio but is not used in this recipe.

## Operations

Recipe operations equal the prepared runner (109). Origin reads:

- `healthcheck`: `GET /v2/self`
- `objects.list` / `objects.get`
- `records.list`: `POST /v2/objects/{object}/records/query`
- `records.get`: `GET /v2/objects/{object}/records/{recordId}`

Twelve dedicated ops split from shared routes: `records.find`, `records.query`, `records.postQuery`, `records.post`, `records.getById`, `records.patch`, `records.searchV2`, `lists.entries.list`, `entries.query`, `lists.entries.create`, `entries.patch`, `workspace_members.listV2`. `records.find` POSTs Composio attributes as the Attio query filter. `records.searchV2` wraps `requestAs` as `{type}`.

Webhook create/list/get/update/delete are HTTP actions against `/v2/webhooks`, not inbound `kind: webhook` contracts.

## Adaptations

Pinned source and official docs agree that workspace API keys and OAuth access tokens are both valid Bearer credentials. This recipe uses the access-token/api-key native shape. Native category is `crm`. Returns raw Attio JSON under `data`.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
