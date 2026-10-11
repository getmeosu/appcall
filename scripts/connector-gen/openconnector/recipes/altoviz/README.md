# Altoviz

Altoviz REST API v1 recipe for the international product at `api.altoviz.com`. Configure an API key from Altoviz Settings > API access. The runner sends `x-api-key`.

Covered operations: credential-only `healthcheck` (`GET /v1/customers?PageIndex=1&PageSize=1`), Composio-mapped customer/contact/product/family/receipt/invoice/credit/quote/supplier/colleague/classification/unit/VAT/settings/user/webhook tools, plus `hello.get` (`GET /hello`) for `ALTOVIZ_TEST_API_KEY`. `ALTOVIZ_UPLOAD_PURCHASE_INVOICE` is omitted because `POST /v1/purchaseinvoices/file` is multipart/form-data.

Official OpenAPI paths are lowercase; native follows that document rather than the pinned PascalCase paths. Native category is `accounting`. PDF downloads omit `responseFormat: json` so non-JSON bodies are returned under `data`. Deletes map empty HTTP 200 bodies to `{deleted:true}`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://developer.altoviz.com/ and https://developer.altoviz.com/openapi.json. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure `apiKey`, call `healthcheck` with `{}`, then `customers.list`.
