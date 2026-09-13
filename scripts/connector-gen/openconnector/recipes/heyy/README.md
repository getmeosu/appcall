# Heyy

Read-only international **Heyy API v3** recipe. Create an API key in Heyy Settings → API Keys and store it as `apiKey`. Requests send `Authorization: Bearer` to `https://api.heyy.io/v3`. API v2 is deprecated and sunsets 2026-11-01; this recipe uses current v3.

## Operations

- `healthcheck`: `POST /channels/search` with hardcoded `pagination.page=0` and `pagination.limit=1` (cheap authenticated read). Official `GET /workspace` is not a pinned upstream action.
- `channels.list`: `POST /channels/search` with optional JSON `pagination.page` (>=0) and `pagination.limit` (1–100).
- `contacts.list`: `POST /contacts/search` with optional `page`, `limit` (1–100), and `search`.
- `contacts.get`: `GET /contacts/{contactId}`; `contactId` is required.
- `labels.list`: `POST /labels/search` with optional `page` and `limit` (1–100).

Successful responses are raw Heyy JSON under AppCall `data`. Writes, message send, and automations are omitted.

## Adaptations

Pinned source used `https://api.heyy.io/api/v2.0` GET list endpoints. Official current host is `https://api.heyy.io/v3` and list reads are `POST .../search` JSON bodies. Native follows current v3 (MailerLite-style docs-over-source host adaptation). Native category is `messaging` (source Communication/Marketing are not in the Rust CATEGORIES allowlist). HTTP 200 bodies with a populated `error` object are demoted via `http.errors.bodyErrorPaths`. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://docs.heyy.io/api-reference/v3/overview. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
