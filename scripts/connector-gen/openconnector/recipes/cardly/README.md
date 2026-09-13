# Cardly

Read-only international **Cardly API v2** recipe. Create test or live API keys in the Cardly organisation portal and store a key as `apiKey`. Requests send `API-Key` and `Accept: application/json` to `https://api.card.ly/v2`.

## Operations

- `healthcheck`: `GET /account/balance` with empty input (cheap authenticated credit-balance probe; pinned credential validator).
- `media.list`: `GET /media` with optional `limit` and `offset`.
- `fonts.list`: `GET /fonts` with optional `limit` and `offset`.
- `writingStyles.list`: `GET /writing-styles` with optional `limit` and `offset`.

Successful responses are raw provider JSON under AppCall `data`. Echo, credit-history time filters, order placement, and other writes are omitted.

## Adaptations

Pinned source and official OpenAPI 2.2.0 agree on `https://api.card.ly/v2` and the `API-Key` header. Native category is `ads` (source Marketing/Productivity are not both in the Rust CATEGORIES allowlist; Cardly is a direct-mail / handwritten-card campaign API). Official `ResponseStatus` uses `status` OK/WARN/ERROR; pinned source schema mentions `state.success`. Native returns the raw envelope. Healthcheck uses the validator's `GET /account/balance` rather than a billable order. The upstream user-agent is not sent. Cardly wraps actions in `defineAction`, so catalog admission uses a `reviewed-action-ids.json` row (CATS/Klangio pattern).

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://api.card.ly/openapi/en-AU/2.2.0. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
