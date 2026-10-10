# ablefy

International ablefy REST API recipe at `https://api.myablefy.com/api`. Configure the API key and API secret from Settings > Integrations > ablefy API. The runner sends them as swagger query parameters `key` and `secret`.

Covered HTTP operations: `healthcheck` (`GET /me`), products list/get/create/update, pricing-plan list/get/delete, orders get/create/cancel, invoices list, payments get, webhook-endpoint CRUD, and funnels list/get. EventOnly webhooks: `webhook.payment_paid`, `webhook.payment_refunded`, `webhook.payment_chargebacked`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://support.ablefy.io/seller/s/article/ablefy-api?language=en_US and https://api.myablefy.com/api/swagger_doc/. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure `apiKey` and `apiSecret`, call `healthcheck` with `{}`, then `products.list`.
