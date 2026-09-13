# Intelliprint

Read-only international **Intelliprint API v1** recipe. Create an API key under the account API keys page at https://account.intelliprint.net/api_keys. Store it as `apiKey`. Requests send `Authorization: Bearer {{apiKey}}` and `Accept: application/json` to `https://api.intelliprint.net/v1`.

## Operations

- `healthcheck`: `GET /prints?limit=1` with empty input (cheap authenticated print-list probe; pinned credential validator).
- `prints.list`: `GET /prints` with optional `limit` (1–1000), `skip` (≥0), `sortOrder` (`asc`/`desc`), `sortField`, and `type` (`letter`/`postcard`).
- `prints.get`: `GET /prints/{id}`; `id` is a required nonempty string.
- `backgrounds.list`: `GET /backgrounds` with optional `limit`, `skip`, and `team`.
- `mailingLists.list`: `GET /mailing_lists` with optional `limit` and `skip`.

Successful responses are raw provider JSON under AppCall `data`. Print-job create/update/delete, background writes, mailing-list writes, recipient reads, repeated `fields` projection, and nested `letters.status` filters are omitted.

## Adaptations

Official Connection, developers FAQ, and Mailchimp integration specify `Authorization: Bearer`. Generated per-endpoint cURL examples and the pinned source send the raw API key without a Bearer prefix. Native follows the official Bearer form. Native category is `productivity` (source Productivity/Communication; Communication is not in the Rust CATEGORIES allowlist). Healthcheck uses the validator's `/prints?limit=1` rather than an unpaged list. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
