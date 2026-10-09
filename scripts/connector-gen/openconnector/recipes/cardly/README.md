# Cardly

International **Cardly API v2** recipe covering origin healthcheck plus every Composio `CARDLY_*` HTTP tool (29 tools, 30 operations including origin `healthcheck`).

Create test or live API keys in the Cardly organisation portal and store a key as `apiKey`. Requests send `API-Key` and `Accept: application/json` to `https://api.card.ly/v2`.

## Operations

- Origin reads: `healthcheck` and `account.balance.get` (`GET /account/balance`), `fonts.list`, `media.list`, `writingStyles.list`.
- Account: credit history and gift credit history with `effectiveTime.*` filters (input `effectiveTimeGt` / `Lt` / `Gte` / `Lte`).
- Catalog: artwork, doodles, templates, plus organisation-only / own-only filters on list endpoints.
- Contact lists: create and list.
- Users and invitations: list, retrieve, create invitation, delete by id or email.
- Orders: list, retrieve, generate preview (`POST /orders/preview`). Place-order is omitted (not a Composio tool).
- Webhooks: list, get, create, update (`POST /webhooks/{id}`), delete.
- Echo: `POST /echo` for authenticated request debugging.

Successful responses are raw provider JSON under AppCall `data`. Optional query values are dropped when omitted. `DELETE /invitations` and `DELETE /users` send a JSON `{email}` body as documented.

## Adaptations

Pinned source and official OpenAPI 2.2.0 agree on `https://api.card.ly/v2` and the `API-Key` header. Native category is `ads` (source Marketing/Productivity are not both in the Rust CATEGORIES allowlist; Cardly is a direct-mail / handwritten-card campaign API). Official `ResponseStatus` uses `status` OK/WARN/ERROR; pinned source schema mentions `state.success`. Native returns the raw envelope. Healthcheck uses the validator's `GET /account/balance` rather than a billable order; `account.balance.get` is the same path for the Composio retrieve-balance tool. The upstream user-agent is not sent. Credit-history time filters use camelCase input names mapped onto official dotted query keys. Cardly wraps actions in `defineAction`, so catalog admission uses a `reviewed-action-ids.json` row (CATS/Klangio pattern).

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://api.card.ly/openapi/en-AU/2.2.0. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
