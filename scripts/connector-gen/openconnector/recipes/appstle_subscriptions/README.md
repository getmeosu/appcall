# Appstle Subscriptions

Read-only Appstle Subscriptions Admin API v2 recipe for the international product at `subscription-admin.appstle.com`. Configure an API key from Appstle Settings → API Key Management; the runner sends it as the official `X-API-Key` header.

Covered operations: credential-only `healthcheck` (`GET /api/external/v2/subscription-contract-details/customers?page=0&size=1`), `customers.list`, `customers.get`, `contract-ids.get`, and `subscription-details.list`. Writes, storefront App Proxy paths, and the `sort` array filter are omitted. Native returns raw JSON under `data` rather than the upstream `{customers}` / `{customer}` / `{contractIds}` wrappers. When `page`/`size` are unset on `customers.list`, native omits them; the pinned source defaults `page=0` and `size=25`.

Native category is `ecommerce` (source Productivity/Marketing are not both in native CATEGORIES). Operator: Appstle Inc., Menlo Park, California.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://developers.appstle.com/subscription/authentication and https://developers.appstle.com/subscription/admin-api-swagger.json. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `customers.list`.
