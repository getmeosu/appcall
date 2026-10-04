# ActiveTrail

International ActiveTrail / MyMarketing API recipe. Create an access token in the ActiveTrail web app under Settings → API Apps and store it in the `apiKey` setup field. The runner sends that token as the raw `Authorization` header value with **no Bearer prefix**. Host is `webapi.mymarketing.co.il`.

## Operations

- `healthcheck` — `GET /account/balance`
- Contacts: list, get, create, delete
- Groups: list, get, create, update, delete, list members, add member
- Email campaigns: list, get, list sent
- Templates: list, get
- Account sending profiles (email and SMS)
- Automations list
- SMS campaigns list

Page is 0-based per official Guides. Query wire names are PascalCase. Unset optionals are omitted. Responses keep raw provider JSON under `data` (list endpoints often return a JSON array). ActiveTrail does not publish a documented inbound webhook event catalog on this API, so no EventOnly webhook operations are declared.

## Adaptations

- Auth is `Authorization: <token>`, matching official Guides and pinned `executors.ts`. Do not send `Bearer`.
- Official Guides document 0-based `Page` (default 0).
- Upstream input `customer_state` (singular) maps to query `CustomerStates`. The documented `SPAM_COMPLIENT` spelling is preserved.

## License / attribution

Upstream provider mapping from [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) revision `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache-2.0). Official API: https://webapi.mymarketing.co.il/api/docs/Guides and https://webapi.mymarketing.co.il/api/docs/user.

## Live smoke

Fixture-only. Live authentication remains unverified.
