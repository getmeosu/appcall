# BetterContact

Read-only international BetterContact API v2 recipe for BETTERCONTACT SAS (Lyon). Configure an API key from https://app.bettercontact.rocks/api_requests. The runner sends `X-API-Key` plus `Accept: application/json` to `https://app.bettercontact.rocks/api/v2`.

## Operations

- `healthcheck` / `account.get`: `GET /account` with empty input. Official docs mark this endpoint rate-limit exempt and it does not spend credits.
- `enrichment.result.get`: `GET /async/{requestId}` for a previously submitted enrichment.

`POST /async` waterfall submit is a billed write and is omitted. Native category is `crm` (source Marketing/Data are not in native CATEGORIES).

## Adaptations

Official authentication is the `X-API-Key` header. Current GET /account docs do not require the pinned `accountEmail` extra field or `api_key`/`email` query parameters; those source extras are omitted. Native success for enrichment results is HTTP 200; HTTP 202 processing is not treated as success. Native returns raw BetterContact JSON under `data`. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://doc.bettercontact.rocks/api-reference/authentication. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
