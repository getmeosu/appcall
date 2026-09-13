# Airspeed (Glyphic)

Read-only international **Airspeed API v1** recipe. Airspeed (formerly Glyphic) is conversation-intelligence SaaS operated by Glyphic AI Limited (UK Companies House 14097529). The API host remains `api.glyphic.ai`.

## Setup

Create an API key in Airspeed API Settings at https://app.goairspeed.com/settings/api. Store it as `apiKey`. Requests send `X-API-Key: <key>` and `Accept: application/json` to `https://api.glyphic.ai`. Official OpenAPI documents 1000 GET requests per minute per key; HTTP 429 on overflow.

## Operations

- `healthcheck`: `GET /v1/call_tags/` with empty input (cheap authenticated org-tag read). Official `GET /v1/test/ping` is the pinned credential validator but is not a provider action.
- `call_tags.list`: same `GET /v1/call_tags/` (trailing slash from OpenAPI).
- `calls.list`: `GET /v1/calls/` with optional `participantEmail`, `cursor`, `limit` (1–100), and `direction` (`next`|`prev`).
- `calls.get`: `GET /v1/calls/{callId}`; `callId` is a required nonempty string (official OpenAPI is 24-hex; native strict schemas cannot express `maxLength`/`pattern`).
- `playbooks.list`: `GET /v1/playbooks/` with the same optional cursor pagination fields.

Successful responses are raw provider JSON under AppCall `data`. Call media/snippets (presigned URLs), bot join writes, and `tag_ids` array filters are omitted.

## Adaptations

Pinned source and official OpenAPI agree on `https://api.glyphic.ai` and the `X-API-Key` header. Native category is `productivity` (source AI/Productivity; Rust CATEGORIES has no AI bucket). Display name is Airspeed after the 2026-05-20 rebrand; `providerId` stays `glyphic`.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
