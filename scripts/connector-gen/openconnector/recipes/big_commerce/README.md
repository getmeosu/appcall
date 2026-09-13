# BigCommerce

Read-only international BigCommerce Management API v3 recipe. Configure a Store API account access token and the store hash. The runner sends `X-Auth-Token` and `Accept: application/json` to `https://api.bigcommerce.com/stores/{store_hash}/v3`.

The Management API host is the fixed official gateway `api.bigcommerce.com`. `storeHash` is a required stored path identifier (Amilia-style), not a caller-supplied storefront or self-hosted host, so the Algolia hostname-wildcard HOLD does not apply.

Healthcheck is documented `GET /catalog/products?limit=1`. Product list/get reads are included. Product create/update/delete and array include/field filters are omitted.

Native category is `ecommerce` (source Marketing/Data). The native key is `big-commerce` while the upstream directory is `big_commerce`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.bigcommerce.com/developer/docs/overview/api-fundamentals/api-accounts. Fixtures are independently derived and do not represent live provider access. Live authentication is unverified.
