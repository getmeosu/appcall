# Simplesat

International Simplesat API v1 recipe. Create an API key in **Settings → API keys** and send it as `X-Simplesat-Token`.

v0.2.0 covers 20 HTTP actions (surveys, questions, responses, answers, customers, team members) plus EventOnly webhooks `webhook.answer_created` and `webhook.feedback_received`. Input `pageSize` maps to query `page_size`; optional filters map to snake_case names. Provider `next` URLs are returned as data and never followed.

Older help copy for customer upsert uses `/api/customers/create-or-update/`; native reads follow the current v1 Postman collection and pinned source `/api/v1` paths.

Pinned source: `oomol-lab/open-connector@33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache-2.0). Fixtures are supplied; live authentication is unverified.
