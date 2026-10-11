# Tapfiliate

International **Tapfiliate REST API 1.6** recipe. Tapfiliate is the affiliate tracking product at [tapfiliate.com](https://tapfiliate.com/). Find the API key in account settings and store it as `apiKey`. Requests send `X-Api-Key` and `Accept: application/json` to `https://api.tapfiliate.com/1.6`.

## Operations

Runner operations equal recipe operations (41 total): origin healthcheck plus every Composio TAPFILIATE tool as a real HTTP action.

- `healthcheck`: `GET /programs/` credential check.
- Origin list/get contracts are kept: `programs.list`, `affiliates.list`, `affiliates.get` (`affiliateId`), `commissions.list`. Those lists gained official Composio query filters.
- Remaining Composio tools map onto affiliates, groups, prospects, programs, conversions, customers, balances, and payments.

Successful responses are raw Tapfiliate JSON under AppCall `data`. DELETE 204 operations return `{ data: { ok: true } }`. Link-header pagination is caller controlled and is not followed.

## Adaptations

Pinned source and official docs agree on `X-Api-Key` and `/1.6` trailing-slash collection paths. Native category is `ads`. The upstream user-agent is not sent. `affiliates.get` keeps origin `affiliateId` (same value as Composio `affiliate_id`). Create-prospect company/address follow official REST objects, not Composio's string fields. `per_page` is forwarded when provided; official docs document 1-based `page` only.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://tapfiliate.com/docs/rest/. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
