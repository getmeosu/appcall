# Tremendous

Read-only international Tremendous Rewards API v2 recipe. Create a production API key under Team settings → Developers after production API access is approved. The runner sends `Authorization: Bearer <API key>` plus `Accept: application/json` to `https://api.tremendous.com/api/v2`. Sandbox `testflight.tremendous.com` is omitted.

## Operations

- `healthcheck`: `GET /organizations` with empty input (pinned credential validator).
- `products.list`: `GET /products` with optional `country`, `currency`, and `subcategory`.
- `products.get`: `GET /products/{id}`.
- `campaigns.list`: `GET /campaigns`.
- `funding-sources.list`: `GET /funding_sources`.

Orders, rewards, reward-link generation, and other writes are omitted. Native returns raw Tremendous JSON under `data`.

## Adaptations

Pinned source and official docs agree on Bearer auth and production `https://api.tremendous.com/api/v2`. Native category is `payments` (source Finance / Marketing are not in the Rust CATEGORIES allowlist; Tremendous is a rewards/payouts API). The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://developers.tremendous.com/docs/authentication and https://developers.tremendous.com/reference/list-organizations. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
