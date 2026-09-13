# Ringg AI

Read-only international **Ringg AI REST API v0** recipe. Generate a workspace API key from Settings → API Key in the dashboard (shown only once). Store it as `apiKey`. Requests send `X-API-KEY: {{apiKey}}` and `Accept: application/json` to `https://prod-api.ringg.ai/ca/api/v0`.

## Operations

- `healthcheck`: `GET /workspace` with empty input (cheap authenticated workspace probe; pinned credential validator).
- `assistants.list`: `GET /agent/all` with optional `limit` (1–100) and `offset`.
- `assistants.get`: `GET /agent/{{id}}`.
- `voices.list`: `GET /agent/voices` with optional `language`.
- `workspace.numbers.list`: `GET /workspace/numbers` with optional `limit` and `offset`.

Successful responses are raw provider JSON under AppCall `data`. Outbound call initiation, call history, campaign CSV uploads, and writes are omitted.

## Adaptations

Pinned source and official docs agree on `https://prod-api.ringg.ai/ca/api/v0` and `X-API-KEY`. Native category is `messaging` (source AI/Communication are not in the Rust CATEGORIES allowlist). Pinned source also sends `Content-Type: application/json` on GET and a user-agent; native GET requests send Accept plus the API key only. Official GET examples omit Content-Type. `skipDnsValidation` is an upstream SDK concern; native pins `prod-api.ringg.ai`.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
