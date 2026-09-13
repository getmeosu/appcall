# EODHD

Read-only EODHD (EOD Historical Data) REST recipe for Unicorn Data Services SAS (Lyon, France). Configure an API token from the EODHD dashboard. The runner sends it as the documented `api_token` query parameter to `https://eodhd.com/api` plus `Accept: application/json`.

Selected operations are `healthcheck` and `user.get` (`GET /user`), `exchanges.list` (`GET /exchanges-list?fmt=json`), `quote.get` (`GET /real-time/{ticker}?fmt=json`), and `eod.get` (`GET /eod/{ticker}?fmt=json` with optional `from`/`to`/`period`). Healthcheck uses the authenticated user probe rather than instrument search. Search, identifier mapping, macros, bulk endpoints, and writes are omitted. HTTP 200 bodies with `message` or `error` are treated as upstream errors.

Adaptations versus the pinned OpenConnector source: quote and EOD always send `fmt=json` because the documented default is CSV; additional tickers, exchange filters, and EOD last-value `filter` are omitted (comma-joined lists and scalar last-value responses are not native-template-safe); list responses keep the raw JSON under `data` instead of source `{user}`/`{exchanges}`/`{quotes}`/`{rows}` wrappers; native category is `banking-data` (source Finance/Data are not in native CATEGORIES); the upstream user-agent is not sent.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://eodhd.com/financial-apis/user-api. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure an API token, call `healthcheck` with `{}`, then `quote.get` with `ticker=AAPL.US`.
