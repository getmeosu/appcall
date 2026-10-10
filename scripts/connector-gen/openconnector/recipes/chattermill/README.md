# Chattermill

Chattermill REST API v1 recipe for the international product at `api.chattermill.com`, version 0.2.0. Create an API key under Chattermill Settings → API. The runner sends `Authorization: Bearer <key>`.

HTTP operations cover projects, responses (list/get/create/update/delete/search), data sources, data types, themes, categories, attributes, tags, custom segments, and metrics, plus credential-only `healthcheck`. EventOnly webhooks map Chattermill workflow events `New Feedback Received` and `Metric Changed`.

`responses.list` uses the official path `GET /{project}/responses`. Native category is `crm`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Fixtures are independently derived and do not represent live provider access.
