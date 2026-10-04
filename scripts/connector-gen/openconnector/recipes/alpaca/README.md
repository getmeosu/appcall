# Alpaca

International Alpaca Trading API v2 recipe. Copy the API key ID and secret from the Alpaca dashboard. Set `tradingHost` to `paper-api` (paper trading, `paper-api.alpaca.markets`) or `api` (live, `api.alpaca.markets`). The runner sends `APCA-API-KEY-ID`, `APCA-API-SECRET-KEY`, and `Accept: application/json`.

## Operations

- `healthcheck`: `GET /v2/account` with empty input (pinned credential validator).
- `assets.list` / `assets.get`: asset catalog reads.
- `positions.list` / `positions.get` / `positions.close`: open position reads and close.
- `orders.list` / `orders.get` / `orders.create` / `orders.cancel`: order lifecycle on the trading host.
- `watchlists.list` / `watchlists.get` / `watchlists.create`: watchlist reads and create.
- `clock.get` / `calendar.list`: US market clock and calendar.
- `account.activities.list` / `account.config.get` / `account.portfolio.history`: account activity, configuration, and equity history.
- `option_contracts.list` / `option_contracts.get`: option contract catalog on the trading host.

Market-data host `data.alpaca.markets` and OAuth remain omitted. Native returns raw JSON under `data`. Native category is `banking-data`.

## Adaptations

Required stored `tradingHost` interpolates `https://{{tradingHost}}.alpaca.markets`. `attributes` comma-join is omitted. Order create leaves qty/notional exclusivity to the provider. Cancel order maps 204 to `data: null`.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://docs.alpaca.markets/docs/authentication-1. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
