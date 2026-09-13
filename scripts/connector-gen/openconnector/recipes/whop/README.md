# Whop

Read-only international Whop REST API v1 recipe. Create an Account API key in the Whop developer dashboard. The runner sends `Authorization: Bearer` plus `Api-Version-Date: 2026-07-01` and `Accept: application/json` to `https://api.whop.com/api/v1`.

## Operations

- `healthcheck`: `GET /accounts/me` with empty input (official first-call account probe).
- `accounts.list`: `GET /accounts` with optional `first` (1–50).
- `accounts.get`: `GET /accounts/{id}`.
- `products.list`: `GET /products` with required `account_id` and optional `first`.
- `memberships.list`: `GET /memberships` with required `account_id` and optional `first`.

Writes, OAuth, array filters (`visibilities`, `product_ids`, `statuses`), and App API-key-only fanout are omitted. Native returns raw Whop JSON under `data`.

## Adaptations

Pinned source used `/companies` and `company_id`. Current official docs renamed that resource to accounts (`GET /accounts/me`, `GET /accounts`, `account_id` on products and memberships). Native follows current docs rather than the stale companies path. `Api-Version-Date` is pinned to `2026-07-01` from the pinned source constant and the official quickstart. Native category is `payments` (source Finance/Marketing). The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://docs.whop.com/developer/quickstart. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure an Account API key, call `healthcheck` with `{}`, then `accounts.list`.
