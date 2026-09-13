# Formstack

Read-only international **Formstack Forms API v2025** recipe. This is the Forms product at `https://www.formstack.com/api/v2025`, not Formstack Documents, Sign, Subaccount provisioning, or the legacy Forms v2 OAuth API.

## Setup

Create a Personal Access Token in Formstack API settings (tokens are prefixed `fs_pat_`). Store it as `apiKey`. Requests send `Authorization: Bearer <token>` and `Accept: application/json`.

## Operations

- `healthcheck`: `GET /forms?pageNumber=1&pageSize=10` with empty input (pinned credential probe; `pageSize` minimum is 10).
- `forms.list`: `GET /forms` with optional `pageNumber`, `pageSize` (10–500), `search`, `orderBy`, `order`, and `folderId` (sent as `folder`).
- `forms.get`: `GET /forms/{formId}` with required positive integer `formId` and optional `includeFields` (sent as `withFields`).
- `form-fields.list`: `GET /forms/{formId}/fields`.
- `submissions.list`: `GET /forms/{formId}/submissions` with optional page/order/keyword filters. `pageSize` is 10–100.

Successful responses are raw provider JSON under AppCall `data`. Writes, encryption-password headers, and `search[n][fieldId]` fanout are omitted.

## Adaptations

Pinned source and official v2025 docs agree on host and Bearer PAT auth. Native input `folderId` maps to query `folder`; `includeFields` maps to query `withFields`.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
