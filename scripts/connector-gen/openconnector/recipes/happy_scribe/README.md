# Happy Scribe

International **Happy Scribe Product API v1** recipe covering origin healthcheck plus every Composio `HAPPY_SCRIBE_*` tool that has a real HTTP endpoint. Create an API key on the Account page at happyscribe.com and store it as `apiKey`. Requests send `Authorization: Bearer` and `Accept: application/json` to `https://www.happyscribe.com/api/v1`.

## Operations

- `healthcheck`: `GET /organizations` with empty input (cheap authenticated probe; pinned credential validator).
- `organizations.list`: `GET /organizations` (origin extra; Composio has no list-organizations tool).
- `transcriptions.list`: `GET /transcriptions` with required `organizationId` and optional `page`, `perPage`, `folderId`, `tags` (`HAPPY_SCRIBE_LIST_TRANSCRIPTIONS`).
- `transcriptions.get`: `GET /transcriptions/{transcriptionId}` (`HAPPY_SCRIBE_HS_GET_TRANSCRIPTION`).
- `transcriptions.delete`: `DELETE /transcriptions/{transcriptionId}` with optional `permanent` (`HAPPY_SCRIBE_DELETE_TRANSCRIPTION`).
- `orders.get`: `GET /orders/{orderId}` (`HAPPY_SCRIBE_RETRIEVE_ORDER`).
- `orders.create`: `POST /orders` transcription/subtitling order (`HAPPY_SCRIBE_CREATE_SUBTITLE`; set `isSubtitle` true for subtitles).
- `orders.createTranslation`: `POST /orders/translation` (`HAPPY_SCRIBE_HS_CREATE_TRANSLATION_ORDER`).
- `orders.confirm`: `POST /orders/{orderId}/confirm` (`HAPPY_SCRIBE_HS_CONFIRM_ORDER`).
- `exports.create`: `POST /exports` (`HAPPY_SCRIBE_HS_EXPORT_TRANSCRIPTION`).
- `exports.get`: `GET /exports/{exportId}` (`HAPPY_SCRIBE_HS_RETRIEVE_EXPORT`).
- `uploads.new`: `GET /uploads/new?filename=` (`HAPPY_SCRIBE_GET_SIGNED_UPLOAD_URL`).
- `translationTasks.create`: deprecated `POST /task/transcription_translation` (`HAPPY_SCRIBE_CREATE_TRANSLATION_TASK`).
- `translationTasks.get`: deprecated `GET /task/transcription_translation/{translationTaskId}` (`HAPPY_SCRIBE_HS_RETRIEVE_TRANSLATION_TASK`).
- `memberships.list`: `GET /organization_memberships` (`HAPPY_SCRIBE_GET_ACCOUNT_DETAILS`).
- `languages.list`: authenticate with `GET /organizations`, then return the documented BCP-47 catalog (`HAPPY_SCRIBE_GET_LANGUAGE_LIST`). There is no `/languages` endpoint.
- `rateLimits.get`: authenticate with `GET /organizations`, then return the documented 200/hour transcription-creation limit (`HAPPY_SCRIBE_GET_RATE_LIMIT`).
- `api.version`: authenticate with `GET /organizations` and infer Product API v1 from the public base path (`HAPPY_SCRIBE_HS_GET_API_VERSION`).
- `errorCodes.list`: authenticate with `GET /organizations`, then return the official error table (`HAPPY_SCRIBE_HS_GET_ERROR_CODES`).
- `formats.list`: authenticate with `GET /organizations`, then return the official export format chart (`HAPPY_SCRIBE_HS_GET_SUPPORTED_FORMATS`).

Successful JSON responses are raw provider JSON under AppCall `data`. Delete and confirm map empty 200/204 bodies to `{deleted|confirmed: true, …Id}`. Catalog probes (`languages.list`, `rateLimits.get`, `api.version`, `errorCodes.list`, `formats.list`) authenticate on `GET /organizations` and map `request.result` onto the documented catalog.

## Not mapped (no public HTTP endpoint)

`HAPPY_SCRIBE_HS_GET_WEBHOOKS` and `HAPPY_SCRIBE_DELETE_WEBHOOK` stay unmapped. Meeting webhooks are configured in Settings → Webhooks, and order notifications use `webhook_url` on `POST /orders`. There is no public REST list or delete.

## Adaptations

Pinned source and official docs agree on `https://www.happyscribe.com/api/v1` and Bearer auth. Native category is `productivity`. Origin camelCase ids (`organizationId`, `transcriptionId`, `orderId`) are kept. New writes flatten Composio nested `order` / `transcription` objects and send official snake_case JSON. Tags on list transcriptions are repeated query params. The PUT to the signed S3 upload URL is not executed (host is not allowlisted). The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
