# Twelve Data

Read-only Twelve Data REST recipe for Twelve Data Pte. Ltd. (Singapore). Configure an API key from the Twelve Data dashboard. The runner sends `Authorization: apikey <key>` to `https://api.twelvedata.com` plus `Accept: application/json`.

Selected operations are credential-only `healthcheck` (`GET /exchanges`), `exchanges.list`, `stocks.list`, `forex_pairs.list`, and `profile.get` (required `symbol`). Price, quote, time series, market movers, and other billable market-data endpoints are omitted. Healthcheck uses the documented exchange catalog rather than the pinned validator's `GET /price?symbol=AAPL`.

HTTP 200 bodies with `code` or `message` are treated as upstream errors. `status` is not used as a body error path because success `status: "ok"` is a non-empty string. Native category is `banking-data` (source Finance/Data are not in native CATEGORIES). Query `apikey` is omitted in favor of the documented header.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://twelvedata.com/docs. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure an API key, call `healthcheck` with `{}`, then `stocks.list` with `symbol=AAPL`.
