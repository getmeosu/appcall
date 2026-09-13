# Reply.io

Read-only international Reply.io API v3 recipe. Create or copy an API key in Settings → API Key (https://run.reply.io) and store it as `apiKey`. Requests send `Authorization: Bearer` and `Accept: application/json` to `https://api.reply.io`.

## Operations

- `healthcheck`: `GET /v3/whoami` (cheap authenticated read; matches pinned credential validation).
- `contacts.list`: `GET /v3/contacts` with optional `top` (1–1000) and `skip`.
- `contacts.get`: `GET /v3/contacts/{id}`.
- `sequences.list`: `GET /v3/sequences` with optional `top` and `skip`.
- `sequences.get`: `GET /v3/sequences/{id}`.

Successful responses are raw provider JSON under AppCall `data`. Contact/sequence writes and start/pause are omitted.

## Adaptations

Pinned source and official v3 docs agree on `https://api.reply.io`, Bearer auth, and `top`/`skip` query names (not `$top`/`$skip`). Native category is `crm` (source Marketing/Communication are not in the Rust CATEGORIES allowlist). Content-Type is omitted on GET. Official 401 responses have an empty body.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
