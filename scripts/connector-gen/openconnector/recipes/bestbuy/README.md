# Best Buy

Read-only Best Buy Developer API v1 recipe for the official US catalog at `https://api.bestbuy.com`. Configure a developer API key from https://developer.bestbuy.com/. The runner sends it as the documented `apiKey` query parameter, always adds `format=json` (collections default to XML without it), and sets `Accept: application/json`.

Selected operations are `healthcheck` (`GET /v1/categories(id=abcat0010000)` with `show=id,name` and `pageSize=1`, matching pinned credential validation), `categories.list` (`GET /v1/categories`), `products.list` (`GET /v1/products`), `products.get` (`GET /v1/products(sku={sku})`), and `stores.list` (`GET /v1/stores`). Optional `page`, `pageSize` (1–100), `show`, and `sort` bind to documented query names. Computed in-path filters (`area(...)`, pipe-separated name clauses, price comparators) and reviews are omitted because native templates cannot reconstruct Best Buy’s in-path query syntax.

Adaptations versus the pinned OpenConnector source: list operations expose the unfiltered collection rather than dynamically building `(clause)` path filters; `products.get` returns the raw collection JSON under `data` instead of the first collection item; `sku` is a string path segment; the upstream user-agent is not sent.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://developer.bestbuy.com/apis and https://bestbuyapis.github.io/api-documentation/. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure the API key, call `healthcheck` with `{}`, then `categories.list` and `products.get`.
