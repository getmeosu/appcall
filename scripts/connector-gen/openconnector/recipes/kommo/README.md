# Kommo

Read-only international **Kommo API v4** recipe. Create a private integration and generate a long-lived token from Keys and scopes. Store the token as `apiKey` and the account subdomain as `subdomain`. Requests send `Authorization: Bearer` to `https://<subdomain>.kommo.com`.

## Operations

- `healthcheck`: `GET /api/v4/account` (cheap authenticated account read).
- `leads.list`: `GET /api/v4/leads` with optional `page` (>=1), `limit` (1–250), and `query`.
- `contacts.list`: `GET /api/v4/contacts` with optional `page`, `limit` (1–250), and `query`.
- `pipelines.list`: `GET /api/v4/leads/pipelines`.
- `users.list`: `GET /api/v4/users` with optional `page` and `limit` (1–250).

Successful responses are raw Kommo JSON under AppCall `data`. Writes, unsorted incoming leads, and array `filter[]` query params are omitted. Empty collections documented as HTTP 204 cannot be expressed as native JSON 200.

## Adaptations

Native category is `crm` (source Marketing/Productivity are not in the Rust CATEGORIES allowlist). Host is the stored subdomain plus bounded `*.kommo.com`. Responses keep raw HAL JSON under `data` instead of the source `{leads, raw}` wrappers. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://developers.kommo.com/docs/long-lived-token and https://developers.kommo.com/reference/account-parameters. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
