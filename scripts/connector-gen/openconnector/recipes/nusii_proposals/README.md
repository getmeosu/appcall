# Nusii Proposals

Read-only international **Nusii Proposals REST API v2** recipe. Create or view a token under Nusii Settings → API and store it as `apiKey`. Requests send `Authorization: Token token=<key>` and `Accept: application/json` to `https://app.nusii.com/api/v2`.

## Operations

- `healthcheck`: `GET /account/me` with empty input (cheap authenticated account probe; pinned credential validator).
- `account.get`: same `GET /account/me`.
- `clients.list`: `GET /clients` with optional `page` and `per`.
- `clients.get`: `GET /clients/{id}`; `id` is a required nonempty string.
- `proposals.list`: `GET /proposals` with optional `page`, `per`, `status` (`draft`|`pending`|`accepted`|`rejected`|`clarification`), `archived`, and `recipient_email`.
- `templates.list`: `GET /templates` with optional `page`, `per`, and `public_templates`.

Successful responses are raw JSON:API under AppCall `data`. Create/update/archive/send writes and OAuth-only MCP flows are omitted.

## Adaptations

Pinned source and official docs agree on `https://app.nusii.com/api/v2/` and `Token token=`. Native base URL omits the trailing slash and uses `/account/me` paths. Native category is `productivity` (source Communication is not in the Rust CATEGORIES allowlist). Official docs recommend User-Agent and Content-Type; native omits the upstream user-agent and does not send Content-Type on these GETs. `recipient_emails` array is omitted because native query templates cannot comma-join; use `recipient_email`.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
