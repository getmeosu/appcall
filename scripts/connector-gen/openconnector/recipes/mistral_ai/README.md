# Mistral AI

Read-only Mistral AI API recipe for the international product at `api.mistral.ai`. Configure an API key from the Mistral Console (API keys). The runner sends `Authorization: Bearer`.

Covered operations: credential-only `healthcheck` (`GET /v1/models`), `models.list`, `models.get`, `files.list`, and `agents.list`. Chat completions, embeddings, OCR, audio, multipart uploads, and file downloads are omitted. `files.list` sends no query. `agents.list` accepts optional `page` and `page_size`. `models.get` requires `model_id`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.mistral.ai/api/. Fixtures are independently derived and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `models.list`.
