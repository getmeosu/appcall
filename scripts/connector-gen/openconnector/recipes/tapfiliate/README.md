# Tapfiliate

Read-only international **Tapfiliate REST API 1.6** recipe. Tapfiliate is the affiliate tracking product at [tapfiliate.com](https://tapfiliate.com/). Find the API key in account settings and store it as `apiKey`. Requests send `X-Api-Key` and `Accept: application/json` to `https://api.tapfiliate.com/1.6`.

## Operations

- `healthcheck`: `GET /programs/` (cheap authenticated program list used for credential validation).
- `programs.list`: `GET /programs/` with optional 1-based `page`.
- `affiliates.list`: `GET /affiliates/` with optional `page`.
- `affiliates.get`: `GET /affiliates/{affiliateId}/`; `affiliateId` is required.
- `commissions.list`: `GET /commissions/` with optional `page`.

Successful responses are raw Tapfiliate JSON under AppCall `data`. List endpoints return JSON arrays. Link-header pagination is caller controlled and is not followed. Writes, conversion creation, and Enterprise click listing are omitted.

## Adaptations

Pinned source and official docs agree on `X-Api-Key` and `/1.6` trailing-slash collection paths. Native category is `ads` (source Marketing/Data are not in the Rust CATEGORIES allowlist). The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://tapfiliate.com/docs/rest/. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
