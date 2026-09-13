# BoldSign

Read-only international **BoldSign US API** recipe. BoldSign is Syncfusion's eSignature product.

## Setup

Generate an API key from API → API Key. Store it as `apiKey`. Requests send `X-API-KEY` and `Accept: application/json` to `https://api.boldsign.com`. This edition is the documented US default host; EU/CA/AU regional keys are out of scope because computed hosts are unsupported.

## Operations

- `healthcheck`: `GET /v1/plan/apiCreditsCount` with empty input (cheap remaining-credit read; pinned credential validator).
- `documents.list`: `GET /v1/document/list` with optional `page` and `pageSize` (official `Page`/`PageSize` query names).
- `documents.get`: `GET /v1/document/properties?documentId=`; `documentId` is required.
- `templates.list`: `GET /v1/template/list` with the same optional page filters.
- `templates.get`: `GET /v1/template/properties?templateId=`; `templateId` is required.

Successful responses are raw provider JSON under AppCall `data`. Sends from templates, array filters, and EU/CA/AU hosts are omitted.

## Adaptations

Official default host is `https://api.boldsign.com` (US). Pinned source computed EU/CA/AU hosts from a required region field; native pins the documented US default because computed hosts are unsupported. Native category is `productivity` (source Communication is not in the Rust CATEGORIES allowlist). Returns raw BoldSign JSON instead of the upstream normalized summaries.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
