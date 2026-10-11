# Mistral AI

Mistral AI API recipe for the international product at `api.mistral.ai`. Configure an API key from the Mistral Console. The runner sends `Authorization: Bearer`.

Covered operations match the runner: credential-only `healthcheck` (`GET /v1/models`) plus Composio MISTRAL_AI tools for models, files, agents, conversations, chat/FIM/embeddings, OCR, audio, batch, libraries, observability, connectors, and workflows. Streaming SSE is omitted. Multipart uploads (`files.upload`, `libraries.documents.upload`, `audio.transcriptions.create` with a raw file) have handwritten handlers that win over the compiled JSON request.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.mistral.ai/api/. Fixtures are independently derived and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `models.list`.
