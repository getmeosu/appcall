# Nasdaq Data Link

Read-only international Nasdaq Data Link Tables API recipe. Copy the API key from Nasdaq Data Link account settings. The runner sends it as the documented `api_key` query parameter and as the `X-Api-Token` header to `https://data.nasdaq.com/api/v3`, plus `Accept: application/json`.

## Operations

- `healthcheck`: `GET /datatables/SHARADAR/TICKERS/metadata.json` with empty input (cheap metadata rather than a ticker data query).
- `datatables.metadata`: `GET /datatables/{vendorCode}/{tableCode}/metadata.json`.
- `datatables.query`: `GET /datatables/{vendorCode}/{tableCode}.json` with optional `ticker`, `columns` (`qopts.columns`), `perPage` (`qopts.per_page`), and `cursorId` (`qopts.cursor_id`).
- `quotes.eod`: `GET /datatables/QUOTEMEDIA/PRICES.json` with required `ticker` and optional `dateGte`, `dateLte`, `perPage`, and `cursorId`. Always requests the pinned default quote columns.
- `dividends.history`: `GET /datatables/SHARADAR/SF1.json` with required `ticker`, `dimension=ARQ`, and optional `date` (`datekey`), `perPage`, and `cursorId`. Always requests the pinned default dividend columns.

Bulk `qopts.export`, analyst-ratings fanout (two tables), dynamic filter-column names, and the real-time-quote alias are omitted. HTTP 200 bodies with a `quandl_error` object fail via `bodyErrorPaths`. Native returns the raw JSON under `data`.

## Adaptations

Official docs authenticate with `api_key`. Native also sends `X-Api-Token` to match pinned source. Native category is `banking-data` (source Finance/Data are not in the Rust CATEGORIES allowlist). The upstream user-agent is not sent. `docs.data.nasdaq.com` is retiring; paths follow pinned source plus the Data Link tools page and Python package.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://data.nasdaq.com/tools/api. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure an API key, call `healthcheck` with `{}`, then `datatables.metadata` with `vendorCode=SHARADAR` and `tableCode=TICKERS`.
