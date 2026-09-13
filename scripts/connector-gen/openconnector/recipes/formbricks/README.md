# Formbricks

Read-only **Formbricks Cloud Management API v2** recipe at `https://app.formbricks.com/api/v2`. This is the managed cloud edition documented by Formbricks as Formbricks Cloud, not a caller-supplied self-hosted host.

## Setup

Create a management API key in Formbricks Cloud (Settings → Organization → API Keys) with Workspace Access for the workspaces you need. Store it as `apiKey`. Requests send `x-api-key` and `Accept: application/json`.

## Operations

- `healthcheck`: `GET /me` with empty input (pinned credential probe).
- `me.get`: `GET /me`.
- `contact-attribute-keys.list`: `GET /management/contact-attribute-keys` with optional `limit` (1–250), `skip`, `sortBy`, `order`, and `workspaceId`.
- `contact-attribute-keys.get`: `GET /management/contact-attribute-keys/{contactAttributeKeyId}`.

Successful responses are raw provider JSON under AppCall `data`. Contact and attribute-key writes are omitted.

## Adaptations

Pinned source hardcodes `https://app.formbricks.com/api/v2`, matching official Cloud OpenAPI. Native GETs omit the upstream user-agent. Date filters and the deprecated `environmentId` alias are omitted from the list operation.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
