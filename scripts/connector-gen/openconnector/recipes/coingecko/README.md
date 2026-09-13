# CoinGecko

Read-only CoinGecko Pro API v3 recipe for Gecko Labs Pte. Ltd. (Singapore). Configure a Pro API key from the CoinGecko Developer Dashboard. The runner sends the documented `x-cg-pro-api-key` header to `https://pro-api.coingecko.com/api/v3` plus `Accept: application/json`. Demo keys that target `https://api.coingecko.com` with `x-cg-demo-api-key` are a separate edition and will not work here. This recipe does not scrape CoinGecko’s website.

Selected operations are `healthcheck` and `currencies.list` (`GET /simple/supported_vs_currencies`), `coins.get` (`GET /coins/{id}` with optional `localization`, `tickers`, and `market_data`), `global.get` (`GET /global`), and `trending.get` (`GET /search/trending`). Healthcheck uses the currencies list rather than `/ping` because ping is not a pinned upstream action. Onchain, search, market-chart, and billable simple-price endpoints are omitted. HTTP 200 bodies with `status.error_message` or `error` are treated as upstream errors.

Adaptations versus the pinned OpenConnector source: host and auth header are pinned to the Pro edition instead of switching on a caller-supplied `plan`; list responses keep the raw JSON array under `data` instead of the source `{currencies}` wrapper; deprecated `community_data`/`developer_data` query flags are omitted; the upstream user-agent is not sent.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.coingecko.com/reference/authentication. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure a Pro API key, call `healthcheck` with `{}`, then `coins.get` with `id=bitcoin`.
