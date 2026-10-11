# Alpha Vantage

Read-only Alpha Vantage query API recipe for the international product at `www.alphavantage.co`. Claim a key at https://www.alphavantage.co/support/#api-key; the runner sends it as the documented `apikey` query parameter.

Covered operations match the runner one-for-one: credential-only `healthcheck` (`GET /query?function=MARKET_STATUS`) plus the 56 Composio ALPHA_VANTAGE tools. Every action is a real `GET /query` with a documented `function` parameter. Healthcheck uses the documented market-status utility rather than a billable premium series.

Alpha Vantage often answers HTTP 200 with `Error Message`, `Information`, or `Note`; native `bodyErrorPaths` demote those to failures. Optional query parameters are omitted when unset. Composio's optional `apikey` override is not an action input; the connector credential is always used.

`LISTING_STATUS`, `EARNINGS_CALENDAR`, `IPO_CALENDAR`, and `TIME_SERIES_INTRADAY_EXTENDED` are CSV-first vendor endpoints. Fixtures use JSON objects so `responseFormat: json` stays compatible with curated-recipe-install; live CSV bodies may fail JSON parse until a text responseFormat is admitted.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://www.alphavantage.co/documentation/. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `market.status`.
