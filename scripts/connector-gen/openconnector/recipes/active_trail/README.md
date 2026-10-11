# ActiveTrail

International ActiveTrail / MyMarketing API recipe. Create an access token in the ActiveTrail web app under Settings → API Apps and store it in the `apiKey` setup field. The runner sends that token as the raw `Authorization` header value with **no Bearer prefix**. Host is `webapi.mymarketing.co.il`.

## Operations

159 operations, one per Composio ACTIVE_TRAIL tool (index version 20260615_00). Help-catalog endpoints that are not in that index are omitted. `smscampaign.operationalMessage.list` is GET /smscampaign/Campaign with FilterType fixed to 3. `operationalMessage.email.create` is POST /OperationalMessage/Message with email_package required, distinct from `operationalMessage.message.create` where email_package is optional.

Webhook rows in the help catalog are webhook-configuration HTTP calls, not inbound events. ActiveTrail does not publish an inbound webhook event catalog on this API, so no EventOnly webhook operations are declared.

Page is 0-based per official Guides. New operation input names are snake_case. Query and body wire names stay as documented. Unset optionals are omitted. Responses keep raw provider JSON under `data`.


## Adaptations

- Auth is `Authorization: <token>`, matching official Guides and pinned `executors.ts`. Do not send `Bearer`.
- Official Guides document 0-based `Page` (default 0).
- Upstream input `customer_state` (singular) maps to query `CustomerStates`. The documented `SPAM_COMPLIENT` spelling is preserved.

## License / attribution

Upstream provider mapping from [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) revision `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache-2.0). Official API: https://webapi.mymarketing.co.il/api/docs/Guides and https://webapi.mymarketing.co.il/api/docs/user.

## Live smoke

Fixture-only. Live authentication remains unverified.
