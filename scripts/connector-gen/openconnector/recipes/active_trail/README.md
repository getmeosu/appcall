# ActiveTrail

Read-only international ActiveTrail / MyMarketing API recipe. Create an access token in the ActiveTrail web app under Settings → API Apps and store it in the `apiKey` setup field. The runner sends that token as the raw `Authorization` header value with **no Bearer prefix**. Host is `webapi.mymarketing.co.il`.

## Operations

- `healthcheck` — cheapest authenticated read: `GET /account/balance`. Expected body is account email/SMS/coupon credit balances, not a contacts page. No pagination query is sent.
- `contacts.list` — `GET /contacts` with optional `customer_state`, `search_term`, `from_date`, `to_date`, `page` (0-based), and `limit` (1–100). Wire query names are PascalCase (`CustomerStates`, `SearchTerm`, `FromDate`, `ToDate`, `Page`, `Limit`). Unset optionals are omitted.
- `groups.list` — `GET /groups` with optional `search_term`, `page`, and `limit`. Same PascalCase query mapping.

Writes, group-member fanout, and contact/group mutation endpoints are not exposed. Responses keep the raw provider JSON under `data` (list endpoints return a JSON array).

## Adaptations

- Auth is `Authorization: <token>`, matching official Guides (`$headr[] = 'Authorization: ' . $authId;`) and pinned `executors.ts`. Do not send `Bearer`.
- Official Guides document 0-based `Page` (default 0). The swagger Page range starts at 1; this recipe follows Guides + pinned source (`minimum: 0`).
- Upstream input `customer_state` (singular) maps to query `CustomerStates`. The documented `SPAM_COMPLIENT` spelling is preserved.

## License / attribution

Upstream provider mapping from [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) revision `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache-2.0). Official API: https://webapi.mymarketing.co.il/api/docs/Guides and https://webapi.mymarketing.co.il/api/docs/user.

## Live smoke

Fixture-only. Live authentication remains unverified.
