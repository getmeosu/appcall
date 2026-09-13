# TaxJar

Read-only international **TaxJar Sales Tax API v2** recipe. TaxJar is the US sales-tax product operated by TPS Unlimited, Inc., a Stripe subsidiary. Generate an API token under Account → API Access and store it as `apiKey`. Requests send `Authorization: Bearer <apiKey>`, `Accept: application/json`, and `x-api-version: 2022-01-24` to `https://api.taxjar.com/v2`.

## Operations

- `healthcheck`: `GET /categories` (official token-verification read; not a billed calculation or rate lookup).
- `nexus.regions.list`: `GET /nexus/regions`.
- `customers.list`: `GET /customers` with optional `page` (>=1) and `per_page` (1–100).
- `customers.get`: `GET /customers/{customerId}`; `customerId` is required.
- `orders.list`: `GET /transactions/orders` with required `fromTransactionDate` and `toTransactionDate` (`YYYY-MM-DD`).

Successful responses are raw TaxJar JSON under AppCall `data`. Writes, `POST /taxes`, and `GET /rates/{zip}` are omitted because official billing counts calculations and rate lookups against plan limits.

## Adaptations

Pinned source and official docs agree on Bearer auth, `/v2`, and `x-api-version: 2022-01-24`. Native category is `accounting` (source Finance/Data are not in the Rust CATEGORIES allowlist). The upstream user-agent and GET `Content-Type` are not sent. Historical 2022 HackerOne account-takeover bugs on `app.taxjar.com` are recorded as remediated.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://developers.taxjar.com/api/reference/. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
