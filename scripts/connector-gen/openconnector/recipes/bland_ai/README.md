# Bland AI

Read-only international **Bland AI API** recipe for `api.bland.ai`. Create an API key in the Bland dashboard (Settings → API Keys) and store it as `apiKey`. Requests send the key in `Authorization` without a Bearer prefix, plus `Accept: application/json`. Official docs also accept `Authorization: Bearer`; native matches the pinned executor.

## Operations

- `healthcheck`: `GET /v1/me` (cheap authenticated account read; same path as the pinned credential validator).
- `calls.list`: `GET /v1/calls` with optional number, window, sort, date, completed, and inbound filters.
- `calls.get`: `GET /v1/calls/{callId}`; `callId` is required.
- `voices.list`: `GET /v1/voices`.
- `voices.get`: `GET /v1/voices/{voiceId}`; `voiceId` is a UUID or curated name.

`POST /v1/calls` is omitted as a billed write. Successful responses are raw provider JSON under AppCall `data` (not the upstream normalized shapes).

## Adaptations

Pinned source and official docs agree on `https://api.bland.ai`. Native category is `messaging` (source AI/Communication are not in the Rust CATEGORIES allowlist). Native omits the upstream user-agent. Some pinned list-call filters are omitted to keep the native query template bounded.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified. Configure the API key, call `healthcheck` with `{}`, then `voices.list`.
