# Attention

Read-only international **Attention** conversation API recipe. Create an organization API key at `https://app.attention.tech` (Settings > API Keys) and store it as `apiKey`. Requests send `Authorization: Bearer` and `Accept: application/json` to `https://api.attention.tech`.

## Operations

- `healthcheck`: `GET /v2/users` (cheap authenticated read; same path as the pinned credential validator).
- `users.list`: `GET /v2/users` with optional `teamUUID` and `includeDeleted`.
- `conversations.list`: `GET /v2/conversations/list` with optional `page`, `size`, `title` (`filter[title]`), `hideInternal` (`filter[hide_internal]`), and `detailedTranscript`.
- `conversations.get`: `GET /v2/conversations/{id}` with optional `by` and `detailedTranscript`.
- `teams.list`: `GET /v2/organizations/teams`.

Successful responses are raw provider JSON under AppCall `data`. Ask Attention is omitted because it is a billed analysis POST.

## Adaptations

Pinned source and official docs agree on Bearer API-key auth and `api.attention.tech/v2`. Conversations list uses the documented optimized `/conversations/list` alias. Array owner/participant/CRM filters are omitted because the native query template cannot comma-join arrays the way the pinned source does. Native category is `productivity` (source AI/Communication are not in the Rust CATEGORIES allowlist). Pinned user-agent is omitted.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
