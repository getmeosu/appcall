# Happy Scribe

Read-only international **Happy Scribe Product API v1** recipe. Create an API key on the Account page at happyscribe.com and store it as `apiKey`. Requests send `Authorization: Bearer` and `Accept: application/json` to `https://www.happyscribe.com/api/v1`.

## Operations

- `healthcheck`: `GET /organizations` with empty input (cheap authenticated probe; pinned credential validator).
- `organizations.list`: `GET /organizations`.
- `transcriptions.list`: `GET /transcriptions` with required `organizationId` and optional `page` (≥0), `perPage` (1–100), and `folderId`.
- `transcriptions.get`: `GET /transcriptions/{transcriptionId}`; `transcriptionId` is required.
- `orders.get`: `GET /orders/{orderId}`; `orderId` is required.

Successful responses are raw provider JSON under AppCall `data`. Create/confirm order, update/delete transcription, and export writes are omitted.

## Adaptations

Pinned source and official docs agree on `https://www.happyscribe.com/api/v1` and Bearer auth. Native category is `productivity` (source AI is not in the Rust CATEGORIES allowlist). `organizationId` is sent as `organization_id`. Tags are omitted because pinned source comma-joins the array. Returns raw JSON instead of the upstream `{organizations|transcription|order, raw}` unwrap. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
