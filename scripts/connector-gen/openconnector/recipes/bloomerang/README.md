# Bloomerang

Read-only international **Bloomerang REST API v2** recipe. Bloomerang is a US nonprofit donor CRM.

## Setup

Generate a private API key from Profile → My Profile → API Keys 2.0. Store it as `apiKey`. Requests send `X-API-KEY` and `Accept: application/json` to `https://api.bloomerang.co/v2`.

## Operations

- `healthcheck`: `GET /constituents?take=1` with empty input (cheap authenticated list probe). Pinned credential validator `GET /user/current` is not a pinned upstream action and is not exposed.
- `constituents.list`: `GET /constituents` with optional `skip` (≥0), `take` (1–50), `type` (`Individual`|`Organization`), `orderBy`, and `orderDirection`.
- `constituents.search`: `GET /constituents/search` with required `search` text and the same optional skip/take plus `type` including `Household`.
- `constituents.get`: `GET /constituent/{constituentId}`; `constituentId` is a required positive integer.

Successful responses are raw provider JSON under AppCall `data`. Writes, OAuth third-party flow, pipe-joined `id` filters, and custom-field pair filters are omitted.

## Adaptations

Official REST API page documents private-key server-to-server auth. v2 host `api.bloomerang.co` and constituent paths come from pinned source. Native category is `crm` (source Productivity). Healthcheck uses a one-record list rather than fabricating `/user/current`.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
