# ConfigCat

Curated read-only Public Management API recipe for the international ConfigCat edition. The pinned upstream revision is `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` from [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector). Authentication setup requires the ConfigCat Public API username (`apiKey`, non-secret) and Public API password (`password`, secret), entered in Rust credential setup; the runner sends HTTP Basic authentication and `Accept: application/json` to `https://api.configcat.com`.

Selected operations are `healthcheck` (`GET /v1/me`, input `{}`), `products.list` (`GET /v1/products`), `configs.list` (`GET /v1/products/{productId}/configs`), and `settings.list` (`GET /v1/configs/{configId}/settings`). `productId` and `configId` are required non-empty strings and are URL encoded as path segments. Responses preserve the normalized provider result under the manifest operation contract; no provider supplied pagination URL is followed.

The supplied fixture cases cover successful requests, 401 handling, missing and empty identifiers, and encoded non-default identifiers. They use deterministic response files and do not represent live provider access. A live smoke check still requires user credentials: configure both setup fields in Rust, call `healthcheck` with `{}`, then `products.list`.

Upstream: [ConfigCat Public Management API](https://configcat.com/docs/api/reference/configcat-public-management-api/). Live smoke: configure credentials in Rust setup, call `healthcheck` with `{}`, then `products.list`.
