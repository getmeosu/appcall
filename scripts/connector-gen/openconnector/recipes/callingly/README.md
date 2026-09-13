# Callingly

Read-only international **Callingly REST API** recipe. Create a bearer token under Settings > API Keys and store it as `apiKey`. Requests send `Authorization: Bearer <token>` and `Accept: application/json` to `https://api.callingly.com`.

## Operations

- `healthcheck`: `GET /v1/teams` with empty input (cheap authenticated probe; pinned credential validator).
- `teams.list`: `GET /v1/teams` with optional `accountId` (sent as `account_id` for agency-scoped client accounts).
- `teams.get`: `GET /v1/teams/{teamId}`; `teamId` is a required positive integer.
- `leads.list`: `GET /v1/leads` with optional `start`, `end`, `phone_number`, and `accountId` (as `account_id`).
- `leads.get`: `GET /v1/leads/{leadId}`; `leadId` is a required positive integer.

Successful responses are raw provider JSON under AppCall `data`. List-teams and list-leads bodies are JSON arrays, so `outputSchema.data` allows array or object. Create-call, SMS, lead mutation, and other writes are omitted.

## Adaptations

Pinned source and official docs agree on `https://api.callingly.com`, `Authorization: Bearer`, and `Accept: application/json`. Native category is `messaging` (source Communication/Productivity are not in the Rust CATEGORIES allowlist). Healthcheck uses the validator's `GET /v1/teams` rather than a search. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
