# BigMailer

BigMailer REST API v1 recipe. Configure an API key from the BigMailer account API page. The runner sends it as the official `X-API-Key` header to `https://api.bigmailer.io` plus `Accept: application/json`.

Covered HTTP operations include brand, list, and contact CRUD, templates, and transactional campaign list/get/send. EventOnly webhooks: `webhook.bounce`, `webhook.click`, `webhook.complaint`, `webhook.open`, `webhook.unsubscribe`.

`brandId` is the native name for official `brand_id`. Responses keep raw provider JSON under `data`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache-2.0). Official docs: https://docs.bigmailer.io/. Fixtures are independently derived; live smoke is unverified.
