# Torii

Read-only international **Torii SaaS Management API** recipe for `https://api.toriihq.com/v1.0`. Torii is the SaaS management platform at [toriihq.com](https://www.toriihq.com/). Generate an API key in Settings → API Access ([app.toriihq.com/team/settings/apiAccess](https://app.toriihq.com/team/settings/apiAccess)) and store it as `apiKey`. Requests send `Authorization: Bearer <apiKey>` and `Accept: application/json`.

## Operations

- `healthcheck`: `GET /orgs/my` with empty input (cheap authenticated organization probe).
- `apps.list`: `GET /apps` with optional `fields` (comma-separated) and `size` (1–1000).
- `apps.get`: `GET /apps/{appId}` with required `appId` (positive integer).
- `users.list`: `GET /users` with optional `size` (1–1000).
- `workflows.list`: `GET /workflows` with optional `type` (`regular`).

Successful responses are raw Torii JSON under AppCall `data`. Writes, SCIM, file upload, contracts (`X-API-Version` / extraQuery objects), and JSON `filters`/`aggs` query blobs are omitted.

## Adaptations

Pinned source and official docs agree on Bearer auth and `GET /orgs/my`. Native category is `productivity` (source Productivity/Finance/Security; Finance and Security are not in the Rust CATEGORIES allowlist). Native returns raw JSON under `data` instead of the pinned camelCase wrappers. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
