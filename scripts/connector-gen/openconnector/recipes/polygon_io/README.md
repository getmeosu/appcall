# Massive (Polygon.io)

Read-only international Massive REST recipe for Massive.com, Inc. (Atlanta), formerly Polygon.io. Configure an API key from the Massive dashboard keys page. The runner sends it as the documented `apiKey` query parameter to `https://api.massive.com` plus `Accept: application/json`. `api.polygon.io` remains a parallel host and is not allowlisted here.

## Operations

- `healthcheck`: `GET /v3/reference/tickers/types` with empty input (pinned credential validator).
- `market-status.get`: `GET /v1/marketstatus/now`.
- `exchanges.list`: `GET /v3/reference/exchanges` with optional `assetClass` and `locale` (wire names `asset_class`, `locale`).
- `ticker.get`: `GET /v3/reference/tickers/{ticker}` with required `ticker` and optional `date`.
- `tickers.list`: `GET /v3/reference/tickers` with optional `ticker`, `type`, `market`, `exchange`, `active`, `order`, `limit`, `sort`, and `cursor`.

Aggregate bars, previous-day bars, ticker range filters (`ticker.gte`/`gt`/`lte`/`lt`), CUSIP/CIK/search, and writes are omitted. Healthcheck uses the ticker-type directory rather than billable aggregate reads. HTTP 200 bodies with a populated `error` string are treated as upstream errors.

## Adaptations

Pinned source and official Massive docs agree on `https://api.massive.com` and `apiKey` query authentication after the 2025-10-30 rebrand. Native category is `banking-data` (source Finance/Data are not in native CATEGORIES). Native returns raw Massive JSON under `data`. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://polygon.io/docs/rest/stocks/tickers/ticker-types and https://massive.com/docs/rest/stocks/tickers/ticker-overview. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
