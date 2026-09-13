# Respond.io

Read-only international Respond.io Developer API v2 recipe. Create a token in Workspace Settings > Integrations > Developer API (Growth plan or above) and store it as `apiKey`. Requests send `Authorization: Bearer` and `Accept: application/json` to `https://api.respond.io/v2`.

## Operations

- `healthcheck`: `GET /space/user?limit=1` (cheap authenticated read; matches pinned credential validation).
- `users.list`: `GET /space/user` with optional `limit` (1–100) and `cursorId`.
- `channels.list`: `GET /space/channel` with optional `limit` and `cursorId`.
- `contacts.get`: `GET /contact/{identifier}` where identifier is `id:<n>`, `email:<address>`, or `phone:<number>`.

Successful responses are raw provider JSON under AppCall `data`. Contact/conversation writes and POST `/contact/list` search are omitted.

## Adaptations

Pinned source, official help, and the Respond.io TypeScript SDK agree on `https://api.respond.io/v2` and Bearer auth. Native category is `messaging` (source Communication/Marketing are not in the Rust CATEGORIES allowlist). Native URL-encodes the full identifier path segment (`id:123` → `id%3A123`); pinned source encodes only the value after the colon.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
