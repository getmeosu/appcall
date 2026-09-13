# Mailtrap

Read-only international **Mailtrap REST API** recipe. Create an API token in Mailtrap Settings > API Tokens. Store it as `apiKey`. The runner sends `Authorization: Bearer` to `https://mailtrap.io`, plus `Accept: application/json`.

## Operations

- `healthcheck`: `GET /api/accounts` with empty input (cheap authenticated account list; pinned credential validator).
- `accounts.list`: `GET /api/accounts`.
- `projects.list`: `GET /api/projects`.
- `sandboxes.list`: `GET /api/sandboxes`.
- `contact-lists.list`: `GET /api/contacts/lists`.

Successful responses are raw provider JSON under AppCall `data`. Writes, sending stats, and message bodies are omitted.

## Adaptations

Official current OpenAPI dropped the `/api/accounts/{account_id}` prefix on projects, sandboxes, and contact lists. Native follows those current official paths rather than the pinned source account-scoped URLs (MailerLite-style docs-over-broken-source). Sandboxes are the official rename of inboxes. Native auth uses Bearer; the alternate `Api-Token` header is omitted. Native category is `email-marketing`. The upstream user-agent is not sent. Optional stored `accountId` from the pinned extraFields is omitted because admitted operations no longer require it.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
