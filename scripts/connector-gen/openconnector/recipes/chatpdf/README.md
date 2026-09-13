# ChatPDF

**HOLD.** Official international ChatPDF backend API at `https://api.chatpdf.com/v1`. Configure an API key from the ChatPDF backend API docs after signing in. The runner sends `x-api-key`.

Pinned OpenConnector actions are PDF import (`POST /sources/add-url`), billed chat (`POST /chats/message`, OpenAI token limits), and delete. There is no cheap account/status/credits GET. The pinned credential validator is format-only. Billable chat/import is not used as healthcheck. `operationQuality` remains unproven, so selection is HOLD.

Covered operations (not admitted): `sources.add-url`, `chats.message`. Multipart file upload and empty-body delete are omitted.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://www.chatpdf.com/docs/api/backend. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
