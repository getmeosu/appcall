# Alpha Vantage

Read-only Alpha Vantage query API recipe for the international product at `www.alphavantage.co`. Claim a key at https://www.alphavantage.co/support/#api-key; the runner sends it as the documented `apikey` query parameter.

Covered operations: credential-only `healthcheck` (`GET /query?function=MARKET_STATUS`), `market.status`, `quote.get`, and `symbols.search`. Premium time series, realtime bulk quotes, options, news, commodities, macros, and technical indicators are omitted. Healthcheck uses the documented market-status utility rather than a billable premium series.

Alpha Vantage often answers HTTP 200 with `Error Message`, `Information`, or `Note`; native `bodyErrorPaths` demote those to failures.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://www.alphavantage.co/documentation/. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `market.status`.
