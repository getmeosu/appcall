# Polar

Read-only Polar Core API v1 recipe. Configure an Organization Access Token (OAT) from Polar organization settings → Developers. The runner sends `Authorization: Bearer` plus `Accept: application/json` to `https://api.polar.sh/v1`. Do not use a Customer Access Token or expose an OAT in client-side code.

Selected operations are `healthcheck` (`GET /organizations/?limit=1`), `organizations.list` (`GET /organizations/`), `products.list` (`GET /products/`), `customers.list` (`GET /customers/`), and `orders.list` (`GET /orders/`). Optional `page` (from 1) and `limit` (1–100) bind to Polar's documented pagination query names; omitted values are dropped. Product/customer/order writes, metadata deepObject filters, array filters, and the sandbox host `sandbox-api.polar.sh` are omitted.

Adaptations versus the pinned OpenConnector source: native Bearer auth uses `http.auth.value`; the upstream user-agent is not sent; list responses keep Polar `{items, pagination}` JSON under `data` instead of unwrapping items. Healthcheck matches the pinned credential validator (`GET /organizations/?limit=1`). Production host only.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://polar.sh/docs/api-reference/introduction and https://polar.sh/docs/integrate/oat. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure the OAT, call `healthcheck` with `{}`, then `organizations.list`.
