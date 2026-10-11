# Massive (Polygon.io)

Read-only international Massive REST recipe for Massive.com, Inc. (Atlanta), formerly Polygon.io. Configure an API key from the Massive dashboard keys page. The runner sends it as the documented `apiKey` query parameter to `https://api.massive.com` plus `Accept: application/json`. `api.polygon.io` remains a parallel host and is not allowlisted here.

Covered operations: 79 real GET tools covering 87 of 90 current Composio POLYGON tools (Oct 5 catalog listed 60). Omitted: deprecated crypto L2 book, removed forex locales, and removed reference markets. Healthcheck remains `GET /v3/reference/tickers/types`.

## Operations

- `healthcheck`: `GET /v3/reference/tickers/types` with empty input (pinned credential validator).
- `aggs.grouped`: `GET /v2/aggs/grouped/locale/us/market/stocks/{{date}}`.
- `aggs.prev`: `GET /v2/aggs/ticker/{{ticker}}/prev`.
- `aggs.range`: `GET /v2/aggs/ticker/{{ticker}}/range/{{multiplier}}/{{timespan}}/{{from}}/{{to}}`.
- `conditions.list`: `GET /v3/reference/conditions`.
- `crypto.aggs.grouped`: `GET /v2/aggs/grouped/locale/global/market/crypto/{{date}}`.
- `crypto.aggs.prev`: `GET /v2/aggs/ticker/{{cryptoTicker}}/prev`.
- `crypto.aggs.range`: `GET /v2/aggs/ticker/{{cryptoTicker}}/range/{{multiplier}}/{{timespan}}/{{from}}/{{to}}`.
- `crypto.ema.get`: `GET /v1/indicators/ema/{{cryptoTicker}}`.
- `crypto.exchanges.list`: `GET /crypto/v1/exchanges`.
- `crypto.last-trade.get`: `GET /v1/last/crypto/{{fromSymbol}}/{{toSymbol}}`.
- `crypto.macd.get`: `GET /v1/indicators/macd/{{cryptoTicker}}`.
- `crypto.open-close.get`: `GET /v1/open-close/crypto/{{base}}/{{quote}}/{{date}}`.
- `crypto.rsi.get`: `GET /v1/indicators/rsi/{{cryptoTicker}}`.
- `crypto.sma.get`: `GET /v1/indicators/sma/{{cryptoTicker}}`.
- `crypto.snapshot.all`: `GET /v2/snapshot/locale/global/markets/crypto/tickers`.
- `crypto.trades.list`: `GET /v3/trades/{{cryptoTicker}}`.
- `dividends.list`: `GET /v3/reference/dividends`.
- `economy.inflation-expectations.list`: `GET /fed/v1/inflation-expectations`.
- `economy.inflation.list`: `GET /fed/v1/inflation`.
- `economy.treasury-yields.list`: `GET /fed/v1/treasury-yields`.
- `ema.get`: `GET /v1/indicators/ema/{{ticker}}`.
- `exchanges.list`: origin reference read.
- `filing-file.get`: `GET /v1/reference/sec/filings/{{filingId}}/files/{{fileId}}`.
- `filing-files.list`: `GET /v1/reference/sec/filings/{{filingId}}/files`.
- `filing.get`: `GET /v1/reference/sec/filings/{{filingId}}`.
- `filings.10k-sections.list`: `GET /stocks/filings/10-K/vX/sections`.
- `filings.list`: `GET /v1/reference/sec/filings`.
- `financials.list`: `GET /vX/reference/financials`.
- `forex.aggs.grouped`: `GET /v2/aggs/grouped/locale/global/market/fx/{{date}}`.
- `forex.aggs.prev`: `GET /v2/aggs/ticker/{{forexTicker}}/prev`.
- `forex.aggs.range`: `GET /v2/aggs/ticker/{{forexTicker}}/range/{{multiplier}}/{{timespan}}/{{from}}/{{to}}`.
- `forex.conversion.get`: `GET /v1/conversion/{{fromCurrency}}/{{toCurrency}}`.
- `forex.ema.get`: `GET /v1/indicators/ema/{{forexTicker}}`.
- `forex.historic-ticks.get`: `GET /v1/historic/forex/{{fromCurrency}}/{{toCurrency}}/{{date}}`.
- `forex.last-quote.get`: `GET /v1/last_quote/currencies/{{fromCurrency}}/{{toCurrency}}`.
- `forex.macd.get`: `GET /v1/indicators/macd/{{forexTicker}}`.
- `forex.quotes.list`: `GET /v3/quotes/{{fxTicker}}`.
- `forex.rsi.get`: `GET /v1/indicators/rsi/{{forexTicker}}`.
- `forex.sma.get`: `GET /v1/indicators/sma/{{forexTicker}}`.
- `forex.snapshot.losers`: `GET /v2/snapshot/locale/global/markets/forex/losers`.
- `futures.aggs.list`: `GET /futures/v1/aggs/{{ticker}}`.
- `futures.products.list`: `GET /futures/v1/products`.
- `futures.quotes.list`: `GET /futures/v1/quotes/{{ticker}}`.
- `futures.schedules.list`: `GET /futures/v1/schedules`.
- `futures.trades.list`: `GET /futures/v1/trades/{{ticker}}`.
- `ipos.list`: `GET /vX/reference/ipos`.
- `last-quote.get`: `GET /v2/last/nbbo/{{symbol}}`.
- `macd.get`: `GET /v1/indicators/macd/{{ticker}}`.
- `market-status.get`: origin reference read.
- `market-status.upcoming`: `GET /v1/marketstatus/upcoming`.
- `news.list`: `GET /v2/reference/news`.
- `open-close.get`: `GET /v1/open-close/{{ticker}}/{{date}}`.
- `options.aggs.range`: `GET /v2/aggs/ticker/{{optionsTicker}}/range/{{multiplier}}/{{timespan}}/{{from}}/{{to}}`.
- `options.chain.snapshot`: `GET /v3/snapshot/options/{{underlyingTicker}}`.
- `options.contract.get`: `GET /v3/reference/options/contracts/{{optionsTicker}}`.
- `options.contracts.list`: `GET /v3/reference/options/contracts`.
- `options.ema.get`: `GET /v1/indicators/ema/{{optionsTicker}}`.
- `options.macd.get`: `GET /v1/indicators/macd/{{optionsTicker}}`.
- `options.rsi.get`: `GET /v1/indicators/rsi/{{optionsTicker}}`.
- `options.sma.get`: `GET /v1/indicators/sma/{{optionsTicker}}`.
- `options.snapshot.get`: `GET /v3/snapshot/options/{{underlyingAsset}}/{{optionContract}}`.
- `related-companies.get`: `GET /v1/related-companies/{{ticker}}`.
- `rsi.get`: `GET /v1/indicators/rsi/{{ticker}}`.
- `sma.get`: `GET /v1/indicators/sma/{{ticker}}`.
- `snapshot.all`: `GET /v2/snapshot/locale/us/markets/stocks/tickers`.
- `snapshot.losers`: `GET /v2/snapshot/locale/us/markets/stocks/losers`.
- `snapshot.ticker`: `GET /v2/snapshot/locale/us/markets/stocks/tickers/{{ticker}}`.
- `splits.list`: `GET /v3/reference/splits`.
- `stocks.balance-sheets.list`: `GET /stocks/financials/v1/balance-sheets`.
- `stocks.cash-flow-statements.list`: `GET /stocks/financials/v1/cash-flow-statements`.
- `stocks.float.list`: `GET /stocks/vX/float`.
- `stocks.short-interest.list`: `GET /stocks/v1/short-interest`.
- `stocks.short-volume.list`: `GET /stocks/v1/short-volume`.
- `taxonomies.risk-factors.list`: `GET /stocks/taxonomies/vX/risk-factors`.
- `ticker-events.list`: `GET /vX/reference/tickers/{{ticker}}/events`.
- `ticker-types.list`: `GET /v3/reference/tickers/types`.
- `ticker.get`: origin reference read.
- `tickers.list`: origin reference read.

## Adaptations

Pinned source and official Massive docs agree on `https://api.massive.com` and `apiKey` query authentication after the 2025-10-30 rebrand. Native category is `banking-data` (source Finance/Data are not in native CATEGORIES). Native returns raw Massive JSON under `data`. Filing file download uses `responseFormat: text`. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://polygon.io/docs/rest/stocks/tickers/ticker-types and https://massive.com/docs/rest/stocks/tickers/ticker-overview. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
