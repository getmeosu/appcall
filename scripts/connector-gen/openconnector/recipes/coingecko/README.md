# CoinGecko

Read-only CoinGecko Pro API v3 recipe for Gecko Labs Pte. Ltd. (Singapore) covering origin healthcheck plus every Composio `COINGECKO_*` HTTP tool (60 tools, 61 operations). Healthcheck is an authenticated `GET /simple/supported_vs_currencies` probe and is not a Composio slug.

Configure a Pro API key from the CoinGecko Developer Dashboard. The runner sends the documented `x-cg-pro-api-key` header to `https://pro-api.coingecko.com/api/v3` plus `Accept: application/json`. Demo keys that target `https://api.coingecko.com` with `x-cg-demo-api-key` are a separate edition and will not work here. This recipe does not scrape CoinGecko’s website.

## Operations

- Auth / utility: `healthcheck`, `ping` (`GET /ping`).
- Prices: `coins.prices.get`, `tokens.prices.get`, `currencies.list`.
- Coins: `coins.list`, `coins.markets.list`, `coins.get`, `coins.contract.get`, `coins.tickers.get`, `coins.history.get`, `coins.market_chart.get`, `coins.ohlc.get`.
- Token charts / lists: `tokens.market_chart.get`, `tokens.market_chart.range.get`, `tokens.list.get`.
- Categories / platforms: `coins.categories.list`, `coins.categories.ids.list`, `asset_platforms.list`.
- Exchanges / derivatives: `exchanges.list`, `exchanges.ids.list`, `exchanges.get`, `exchanges.tickers.list`, `exchanges.volume_chart.get`, `derivatives.tickers.list`, `derivatives.exchanges.list`, `derivatives.exchanges.ids.list`, `derivatives.exchanges.get`, `exchange_rates.get`.
- NFTs: `nfts.list`, `nfts.get`, `nfts.contract.get`.
- Onchain: networks, DEXes, pools, pool info/OHLCV/trades, new/trending/search pools, tokens, token info/prices, recently updated tokens.
- Public treasury / RWA: entities, holders, holding charts, transactions, RWAs, issuers, RWA markets.
- Search / trending / global: `search`, `trending.get`, `global.get`.

Successful JSON responses are raw CoinGecko JSON under AppCall `data`. List endpoints that return JSON arrays use `outputSchema.data` as array. Optional query fields are omitted when unset. Array query/path values are comma-separated to match official CoinGecko encoding. HTTP 200 bodies with `status.error_message` or `error` are treated as upstream errors. Dual-path Composio tools that switch between all-networks and per-network (or days vs Unix-range) routes use the documented general path.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.coingecko.com/reference/authentication. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure a Pro API key, call `healthcheck` with `{}`, then `coins.get` with `id=bitcoin`.
