# Stannp

Read-only international Stannp Direct Mail API v1 recipe. Copy the API key from Stannp account settings and set `region` to `us` (US/CA, `api-us1.stannp.com`) or `eu` (EU/UK, `api-eu1.stannp.com`). The runner sends HTTP Basic Auth with the API key as username and an empty password plus `Accept: application/json`.

## Operations

- `healthcheck`: `GET /v1/accounts/balance` with empty input (pinned credential validator).
- `recipients.list`: `GET /v1/recipients/list` with optional `groupId` (`group_id`), `offset`, and `limit`.
- `recipients.get`: `GET /v1/recipients/get/{recipientId}`.
- `groups.list`: `GET /v1/groups/list` with optional `offset` and `limit`.

Creates, deletes, address validation POSTs, campaigns, and mail-piece sends are omitted. Native returns the raw `{success,data}` JSON under `data`. HTTP 200 bodies with a non-empty `error` string fail via `bodyErrorPaths`.

## Adaptations

Pinned source and official docs agree on Basic Auth `-u {API_KEY}:` and the two regional hosts. Required stored `region` interpolates `https://api-{{region}}1.stannp.com` with allowlisted `api-eu1.stannp.com` and `api-us1.stannp.com`. Native category is `ads` (source Marketing is not in the Rust CATEGORIES allowlist; Stannp is a direct-mail campaign API). The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://www.stannp.com/us/direct-mail-api/guide. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
