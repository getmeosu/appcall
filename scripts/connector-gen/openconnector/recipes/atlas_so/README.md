# Atlas.so

Read-only international **Atlas.so** customer-support API recipe. Create an API key in Atlas under App Config > API (`https://app.getatlas.io/configuration/external-api`) and store it as `apiKey`. Requests send `Authorization: Bearer` and `Accept: application/json` to `https://api.atlas.so`.

## Operations

- `healthcheck`: `GET /v1/accounts?limit=1` (cheap authenticated read; same path as the pinned credential validator).
- `accounts.list`: `GET /v1/accounts` with optional `cursor` and `limit`.
- `accounts.get`: `GET /v1/accounts/{id}`.
- `customers.list`: `GET /v1/customers` with optional `cursor` and `limit`.
- `customers.get`: `GET /v1/customers/{id}`.

Successful responses are raw provider JSON under AppCall `data`. Account/customer upserts, customer lookup POST, and session listing are omitted.

## Adaptations

Public HTML REST catalog for `/v1/accounts` is not published; paths follow the pinned source plus the App Config API key page and Atlas help center. Native category is `productivity` (source Communication/Productivity; Communication is not in the Rust CATEGORIES allowlist). Returns raw list envelopes instead of the pinned `{accounts,total,cursor,limit,raw}` reshape. Pinned user-agent is omitted.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
