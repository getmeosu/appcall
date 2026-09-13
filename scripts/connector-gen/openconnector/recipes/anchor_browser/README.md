# Anchor Browser

Read-only international **Anchor Browser API** recipe for `api.anchorbrowser.io`. Create an API key in the Anchor dashboard (API Access) and store it as `apiKey`. Requests send `anchor-api-key` and `Accept: application/json`.

## Operations

- `healthcheck`: `GET /v1/billing` (cheap authenticated billing-balance read; same path as the pinned credential validator).
- `billing.get`: `GET /v1/billing`.
- `projects.metadata.get`: `GET /v1/projects/{projectId}/metadata`; `projectId` is required.

Session creation (`POST /v1/sessions`) is omitted as a billed write. Successful responses are raw provider JSON under AppCall `data`.

## Adaptations

Pinned source and official docs agree on `https://api.anchorbrowser.io` and the `anchor-api-key` header. Native category is `dev-tools` (source Developer Tools / AI is not in the Rust CATEGORIES allowlist). Official optional billing usage-window query parameters are omitted because the pinned `get_billing_info` action has an empty input schema. `GET /v1/projects/{projectId}/metadata` is retained from the pinned executor; the current public index emphasizes applications and billing. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified. Configure the API key, call `healthcheck` with `{}`, then `billing.get`.
