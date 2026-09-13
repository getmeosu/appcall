# ASIN Data API

Read-only international Traject Data ASIN Data API recipe. Copy the API key from the ASIN Data API dashboard. Requests send `api_key` as a query parameter and `Accept: application/json` to `https://api.asindataapi.com`.

## Operations

- `healthcheck`: `GET /account` with empty input (pinned credential validator; officially free of charge).
- `destinations.list`: `GET /destinations` with optional `page`, `sort_by` (`type`|`name`), `search_term`, and `sort_direction`.
- `collections.get`: `GET /collections/{collection_id}`.
- `collection-requests.list`: `GET /collections/{collection_id}/requests/{page}` with required `page` (minimum 1).

Billed `GET /request` product/search lookups, destination updates, and request deletes are omitted. Native returns raw provider JSON under `data`. HTTP 200 bodies with `request_info.message` fail via `bodyErrorPaths`.

## Adaptations

Pinned source and official docs agree on `https://api.asindataapi.com` and the `api_key` query parameter. Native category is `ecommerce` (source Data/Marketing are not in the Rust CATEGORIES allowlist). The Collections API is officially free of charge; product lookups are billed and are not used as healthcheck. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://docs.trajectdata.com/asindataapi/account-api. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
