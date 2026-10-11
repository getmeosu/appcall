# Mailtrap

International **Mailtrap REST API** recipe. Create an API token in Mailtrap Settings > API Tokens. Store it as `apiKey`. The runner sends `Authorization: Bearer` to `https://mailtrap.io`, plus `Accept: application/json`.

## Operations

Origin inventory (unscoped current official list paths):

- `healthcheck`: `GET /api/accounts`
- `accounts.list`: `GET /api/accounts` (`MAILTRAP_LIST_ACCOUNTS`)
- `projects.list`: `GET /api/projects`
- `sandboxes.list`: `GET /api/sandboxes`
- `contact-lists.list`: `GET /api/contacts/lists`

Composio tools that take `account_id` use the account-scoped Mailtrap paths (`/api/accounts/{account_id}/...`) from the pinned open-connector runtime. Successful JSON responses are raw provider payloads under AppCall `data`. Deletes return `{success: true}` on HTTP 200/204. `messages.html.get` returns HTML text.

## Adaptations

Official current OpenAPI dropped the `/api/accounts/{account_id}` prefix on some inventory endpoints. Native keeps those unscoped origin list operations and adds Composio's account-scoped tools beside them. Native auth uses Bearer. Native category is `email-marketing`. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
