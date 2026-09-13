# Lightfield

Read-only international **Lightfield CRM API** recipe. Admins create keys at [API keys settings](https://crm.lightfield.app/crm/settings/api-keys) and store the `sk_lf_...` value as `apiKey`. Requests send `Authorization: Bearer <apiKey>`, `Accept: application/json`, and `Lightfield-Version: 2026-03-01` to `https://api.lightfield.app`.

## Operations

- `healthcheck`: `GET /v1/auth/validate` with empty input (official key metadata probe; no scope required).
- `objects.list`: `GET /v1/objects` (custom object type definitions).
- `accounts.list`: `GET /v1/accounts` with optional `limit` (1–25) and `offset`.
- `accounts.get`: `GET /v1/accounts/{id}`.
- `contacts.list`: `GET /v1/contacts` with optional `limit` and `offset`.

Successful responses are raw Lightfield JSON under AppCall `data`. Dynamic `$field` filter query keys are omitted. Writes, custom-object record fanout, and meetings/notes are omitted.

## Adaptations

Pinned source and official docs agree on `https://api.lightfield.app`, Bearer auth, and `Lightfield-Version: 2026-03-01`. Native category is `crm` (source Productivity/AI; `AI` is not in the Rust CATEGORIES allowlist). List-account Search rate-limit category is not used for healthcheck. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
