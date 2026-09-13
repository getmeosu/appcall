# BoloForms

Read-only **BoloForms Signature API** recipe at `https://sapi.boloforms.com`. This is the managed Signature edition documented by BoloForms, not a caller-supplied host.

## Setup

Generate an API key in BoloForms Signature (Settings → API Key). Store it as `apiKey`. Requests send `x-api-key` and `Accept: application/json`.

## Operations

- `healthcheck`: `GET /signature/get-documents?page=1&limit=1` with empty input (pinned credential probe).
- `documents.list`: `GET /signature/get-documents` with optional `query`, `documentId`, `filter`, `sortBy`, `sortOrder`, `dateFrom`, `dateTo`, `page`, `limit`, and optional `workspaceId` header.
- `template-respondents.list`: `GET /signature/get-template-respondent` with required `templateId` and optional `page`/`limit`.
- `form-responses.list`: `GET /signature/get-form-responses` with required `formId` and optional `page`/`limit`.

Successful responses are raw provider JSON under AppCall `data`. Template send writes are omitted.

## Adaptations

Official GitBook documents `x-api-key` and `POST /signature/pdf-template-lambda`; list GETs are not in that GitBook and follow pinned source on the same host `sapi.boloforms.com`. Native GETs omit the upstream user-agent. Native category is `forms` (source Productivity). Pipedream's `signature-backend.boloforms.com/get-all-forms` path is not used.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified. A 2024-10-22 Killsec leak-site listing of boloforms.com is recorded as an unsupported allegation with no vendor confirmation in reviewed coverage.
