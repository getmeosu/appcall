# Alpaca

Read-only international Alpaca Trading API v2 recipe. Copy the API key ID and secret from the Alpaca dashboard. Set `tradingHost` to `paper-api` (paper trading, `paper-api.alpaca.markets`) or `api` (live, `api.alpaca.markets`). The runner sends `APCA-API-KEY-ID`, `APCA-API-SECRET-KEY`, and `Accept: application/json`.

## Operations

- `healthcheck`: `GET /v2/account` with empty input (pinned credential validator).
- `assets.list`: `GET /v2/assets` with optional `status` and `assetClass` (`asset_class`).
- `positions.list`: `GET /v2/positions`.
- `clock.get`: `GET /v2/clock`.
- `watchlists.list`: `GET /v2/watchlists`.

Orders, watchlist-by-name path switching, market-data (`data.alpaca.markets`), OAuth, and writes are omitted. Native returns raw JSON under `data`. Native category is `banking-data` (source Finance / Data).

## Adaptations

Pinned source and official docs agree on the two trading hosts and the APCA key-id/secret headers. Required stored `tradingHost` interpolates `https://{{tradingHost}}.alpaca.markets` because source `environment` `paper`/`live` cannot form those hostnames. `attributes` comma-join is omitted. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://docs.alpaca.markets/docs/authentication-1. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
