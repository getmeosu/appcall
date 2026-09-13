# Botpress

Read-only **Botpress Cloud Admin API v1** recipe at `https://api.botpress.cloud/v1/admin`. This is the managed Cloud edition documented by Botpress, not a caller-supplied host.

## Setup

Generate an API token from the Botpress dashboard and copy the workspace ID from workspace settings. Store the token as `apiKey` and the workspace ID as required `workspaceId`. Requests send `Authorization: Bearer`, `x-workspace-id`, and `Accept: application/json`.

## Operations

- `healthcheck`: `GET /bots` with empty input (pinned credential probe).
- `workspaces.list`: `GET /workspaces` with optional `nextToken` and `handle`.
- `bots.list`: `GET /bots` with optional `dev`, `nextToken`, `sortField` (`createdAt`/`updatedAt`), and `sortDirection` (`asc`/`desc`).
- `bots.get`: `GET /bots/{botId}`.

Successful responses are raw provider JSON under AppCall `data`. Bot writes and `tags[key]` query encoding are omitted.

## Adaptations

Required stored `workspaceId` interpolates the `x-workspace-id` header on fixed host `api.botpress.cloud` (header id, not a caller host). Native GETs omit the upstream user-agent. Native category is `dev-tools` (source AI/Developer Tools; AI is not in Rust CATEGORIES).

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
