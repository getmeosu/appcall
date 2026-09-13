# Codegen

Read-only international **Codegen Developer API** recipe for `api.codegen.com`. Generate an API token at [codegen.com/token](https://codegen.com/token) and store it as `apiKey`. Requests send `Authorization: Bearer <token>` plus `Accept: application/json`.

## Operations

- `healthcheck`: `GET /v1/users/me` (cheap authenticated identity read; same path as the pinned credential validator).
- `organizations.list`: `GET /v1/organizations` with optional `skip` and `limit` (1-100).
- `repositories.list`: `GET /v1/organizations/{org_id}/repos`; `org_id` is required.
- `users.list`: `GET /v1/organizations/{org_id}/users`; `org_id` is required.
- `agent-runs.get`: `GET /v1/organizations/{org_id}/agent/run/{agent_run_id}`; `org_id` and `agent_run_id` are required.

POST agent-run create/resume is omitted as a write. Successful responses are raw provider JSON under AppCall `data`.

## Adaptations

Pinned source and official docs agree on `https://api.codegen.com` and Bearer auth. Native category is `dev-tools` (source AI is not a native CATEGORY). Native omits the upstream user-agent. Org-scoped reads require `org_id` as input instead of the pinned stored `organizationId` extra field.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified. Configure the API token, call `healthcheck` with `{}`, then `organizations.list`.
