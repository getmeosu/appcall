# Twelve Data

Twelve Data REST recipe for Twelve Data Pte. Ltd. (Singapore). Configure an API key from the Twelve Data dashboard. The runner sends `Authorization: apikey <key>` to `https://api.twelvedata.com` plus `Accept: application/json`.

Selected operations cover credential-only `healthcheck` (`GET /exchanges`), reference catalogs (`exchanges.list`, `stocks.list`, `forex_pairs.list`, `etfs.list`, `cryptocurrencies.list`, `symbol_search`), market data (`price.get`, `quote.get`, `eod.get`, `time_series.get`, `market_state.list`, `earliest_timestamp.get`, `market_movers.get`), fundamentals (`profile.get`, `statistics.get`, `dividends.get`, `splits.get`, `earnings.get`), and `rsi.get`. Native requires `symbol` where the vendor accepts any of symbol/figi/isin/cusip.

HTTP 200 bodies with `code` or `message` are treated as upstream errors. Native category is `banking-data`. Query `apikey` is omitted in favor of the documented header.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://twelvedata.com/docs. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure an API key, call `healthcheck` with `{}`, then `stocks.list` with `symbol=AAPL`.
