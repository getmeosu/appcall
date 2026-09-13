# BigMailer

Read-only BigMailer REST API v1 recipe. Configure an API key from the BigMailer account API page. The runner sends it as the official `X-API-Key` header to `https://api.bigmailer.io` plus `Accept: application/json`.

Selected operations are `healthcheck` (`GET /v1/brands?limit=1`), `brands.list` (`GET /v1/brands` with optional `limit` 1–100 and `cursor`), `brands.get` (`GET /v1/brands/{brandId}`), `lists.list` (`GET /v1/brands/{brandId}/lists`), and `contacts.list` (`GET /v1/brands/{brandId}/contacts` with optional `listId` mapped to documented `list_id`). Brand, list, and contact mutations are omitted.

Adaptations versus the pinned OpenConnector source: `brandId` is the native name for official `brand_id` and is URL-encoded as a path segment; `listId` maps to query `list_id`; GET requests omit `Content-Type` because the source only sets it for JSON bodies; the upstream user-agent is not sent; responses keep raw provider JSON under `data` instead of the source `page`/`brands`/`lists`/`contacts` envelopes.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.bigmailer.io/ and https://docs.bigmailer.io/reference/listbrands. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure the API key, call `healthcheck` with `{}`, then `brands.list`.
