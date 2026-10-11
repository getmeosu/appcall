# Alpha Vantage

Alpha Vantage query API recipe for the international product at `www.alphavantage.co`. Claim a key at https://www.alphavantage.co/support/#api-key; the runner sends it as the documented `apikey` query parameter.

Covered operations: `healthcheck` (`MARKET_STATUS`), market status, global quote, symbol search, daily/weekly/monthly/intraday time series, company overview and financial statements, FX rate, crypto daily, news sentiment, RSI/SMA/MACD, and top gainers/losers. Alpha Vantage has no vendor webhooks.

HTTP 200 bodies with `Error Message`, `Information`, or `Note` are demoted via native `bodyErrorPaths`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache-2.0). Official docs: https://www.alphavantage.co/documentation/. Fixtures are independently derived; live smoke is unverified.
