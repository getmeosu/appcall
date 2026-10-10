# Whop

International Whop REST API v1 recipe covering the Composio WHOP toolkit (19 HTTP tools) plus origin healthcheck, accounts.list, and products.list. Create an Account API key in the Whop developer dashboard. The runner sends `Authorization: Bearer` plus `Api-Version-Date: 2026-07-01` and `Accept: application/json` to `https://api.whop.com/api/v1`.

## Operations

Origin (kept):

- `healthcheck`: `GET /accounts/me` with empty input.
- `accounts.list`: `GET /accounts` with optional `first` (1–50).
- `accounts.get`: `GET /accounts/{id}` (also maps to WHOP_RETRIEVE_COMPANY; `id` may be `me`).
- `products.list`: `GET /products` with required `account_id` and optional `first`.
- `memberships.list`: `GET /memberships` with origin `account_id` plus Composio `company_id` and list filters (WHOP_LIST_MEMBERSHIPS).

Composio WHOP tools added as real request blocks:

- `access_tokens.create` `POST /access_tokens`
- `files.create` `POST /files`
- `files.get` `GET /files/{id}`
- `promo_codes.delete` `DELETE /promo_codes/{id}`
- `promo_codes.get` `GET /promo_codes/{id}`
- `apps.list` `GET /apps`
- `apps.get` `GET /apps/{id}`
- `authorized_users.list` `GET /authorized_users`
- `authorized_users.get` `GET /authorized_users/{id}`
- `members.list` `GET /members`
- `members.get` `GET /members/{id}`
- `payment_methods.list` `GET /payment_methods`
- `payments.list` `GET /payments`
- `company_token_transactions.get` `GET /company_token_transactions/{id}`
- `plans.get` `GET /plans/{id}` (deprecated compatibility endpoint for variants)
- `plans.update` `PATCH /plans/{id}`
- `users.get` `GET /users/{id}`

Native returns raw Whop JSON under `data`. List filters that Composio names `company_id` are forwarded as `company_id` and, where origin already sent it, `account_id` (official Current API list query).

## Adaptations

Pinned source used `/companies` and `company_id`. Origin native followed the 2026-07-01 accounts rename (`GET /accounts/me`, `account_id` on products). Composio WHOP still documents `company_id`; list operations accept both names. Plans remain on `/plans` as Whop's documented compatibility surface for variants (`plan_` ids). `Api-Version-Date` stays `2026-07-01` so origin fixtures keep matching. Native category is `payments`. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://docs.whop.com/developer/quickstart. Composio: https://docs.composio.dev/toolkits/WHOP. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
