# Botpress

Botpress Cloud APIs at `https://api.botpress.cloud` covering Admin, Runtime/Chat, Files, and Tables. This is the managed Cloud edition documented by Botpress, not a caller-supplied host.

## Setup

Generate an API token from the Botpress dashboard and copy the workspace ID from workspace settings. Store the token as `apiKey` and the workspace ID as required `workspaceId`. Requests send `Authorization: Bearer`, `x-workspace-id`, and `Accept: application/json`. Chat, Files, and Tables operations also send `x-bot-id` from input.

## Operations

Origin Admin reads:

- `healthcheck`: `GET /bots` with empty input (pinned credential probe).
- `workspaces.list`: `GET /workspaces` with optional `nextToken` and `handle`.
- `bots.list`: `GET /bots` with optional `dev`, `nextToken`, `sortField`, and `sortDirection`.
- `bots.get`: `GET /bots/{botId}`.

Composio-aligned Admin, Runtime, Files, and Tables operations use official `@botpress/client@2.7.0` paths. Chat/Files/Tables ops override `request.baseUrl` to `/v1/chat`, `/v1/files`, or `/v1/tables`. Successful responses are raw provider JSON under AppCall `data`. Deletes return `{ success: true }` for empty 200/204 bodies.

## Adaptations

Required stored `workspaceId` interpolates the `x-workspace-id` header on fixed host `api.botpress.cloud`. Optional Composio `x-workspace-id` / `xWorkspaceId` overlays that header. Native category is `dev-tools` (source AI/Developer Tools; AI is not in Rust CATEGORIES). Integration names that contain `/` are URL-encoded path segments.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`, plus official Botpress Cloud paths from `@botpress/client@2.7.0`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
