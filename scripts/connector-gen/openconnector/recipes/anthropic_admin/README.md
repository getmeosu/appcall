# Anthropic Admin

Read-only international **Anthropic Admin API** recipe for `api.anthropic.com`. Create an Admin API key in the Anthropic Console (Admin keys) and store it as `apiKey`. Requests send `x-api-key`, `anthropic-version: 2023-06-01`, `Accept: application/json`, and `Content-Type: application/json`.

## Operations

- `healthcheck`: `GET /v1/organizations/me` (cheap authenticated org read; same path as the pinned credential validator).
- `organization.get`: `GET /v1/organizations/me`.
- `users.list`: `GET /v1/organizations/users` with optional `before_id`, `after_id`, and `limit` (1–1000).
- `workspaces.list`: `GET /v1/organizations/workspaces` with optional cursor pagination.
- `api_keys.list`: `GET /v1/organizations/api_keys` with optional `workspace_id` and cursor pagination.

Writes (invite/user/workspace mutations) and OAuth `org:admin` bearer are omitted. Successful responses are raw provider JSON under AppCall `data`.

## Adaptations

Pinned source and official docs agree on `https://api.anthropic.com`, Admin `x-api-key`, and `anthropic-version: 2023-06-01`. Native category is `dev-tools` (source AI is not in the Rust CATEGORIES allowlist). Native omits the upstream user-agent. Content-Type is sent on GET to match the pinned executor and official Admin curl examples. Official `status` / `created_by_user_id` API-key filters are omitted because the pinned action does not declare them.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified. Configure the Admin API key, call `healthcheck` with `{}`, then `organization.get`. Historical non-China Anthropic incidents are recorded under the 2026-09-13 waiver.
