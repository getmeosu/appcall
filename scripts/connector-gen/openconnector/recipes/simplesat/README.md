# Simplesat

International Simplesat API v1 recipe. Create an API key in **Settings → API keys** and send it as `X-Simplesat-Token`.

Operations are bounded reads: `healthcheck` (`GET /api/v1/surveys?page_size=1`), `surveys.list`, `questions.list`, `customers.list`, and `customers.get`. Input `pageSize` maps to query `page_size`; optional question and customer filters map to snake_case query names. Provider `next` URLs are returned as data and never followed. Response search POST, customer upsert, and survey-email writes are omitted.

Older help copy for customer upsert uses `/api/customers/create-or-update/`; native reads follow the current v1 Postman collection and pinned source `/api/v1` paths.

Pinned source: `oomol-lab/open-connector@33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache-2.0). Fixtures are supplied; live authentication is unverified.
