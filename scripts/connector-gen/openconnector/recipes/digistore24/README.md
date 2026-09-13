# Digistore24

Read-only international Digistore24 HTTP API recipe pinned to `www.digistore24.com`. Configure an API key from vendor Settings > Account access > API keys. The runner sends `X-DS-API-KEY` to `https://www.digistore24.com/api/call/{function}`.

Covered operations: credential-only `healthcheck` (`GET /api/call/getUserInfo`), `user.get`, `products.list`, `products.get`, and `buyers.list`. Named query parameters match the official HTTP call docs (`sort_by`, `product_id`, `page_no`, `page_size`). Purchase search JSON blobs and writes are not exposed.

HTTP 200 envelopes with `result: "error"` also carry `message`. Native `bodyErrorPaths` uses `[message]` because `result: "success"` is a non-empty string and would false-fail. Native category is `payments`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache-2.0). Official docs: https://dev.digistore24.com/hc/en-us/articles/32479630493585-API-basics. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `products.list`.
