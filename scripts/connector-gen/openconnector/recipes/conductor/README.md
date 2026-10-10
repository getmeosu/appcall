# Conductor

International **Conductor cloud API** (`https://api.conductor.build`) recipe covering credential `healthcheck` plus every Composio `CONDUCTOR_*` HTTP tool (17 tools, 18 operations). Healthcheck is an authenticated `GET /me` probe and is not a Composio slug.

Origin/main shipped a different product under this slug (Conductor Monitoring Reporting API at `api.cm.conductor.com`). Composio's `CONDUCTOR` toolkit is conductor.build: cloud workspaces, coding-agent sessions, messages, and transcript search. This recipe follows the Composio toolkit.

Create an API key at https://app.conductor.build/home/api-keys and store it as `apiKey`. Requests send `Authorization: Bearer <token>` and `Accept: application/json`.

## Operations

- Auth: `healthcheck`, `me.get` (`GET /me`).
- Projects: `projects.list`, `projects.get`.
- Workspaces: `workspaces.list`, `workspaces.get`, `workspaces.create`, `workspaces.rename`, `workspaces.change_state` (`archive` | `unarchive` | `sleep`).
- Sessions: `sessions.list`, `sessions.create`, `sessions.get`, `sessions.rename`, `sessions.cancel`.
- Messages: `messages.list`, `messages.get`, `messages.create`.
- Transcripts: `transcripts.query` (`POST /v0/sql` over `session_transcripts_view`).

Successful JSON responses are raw Conductor JSON under AppCall `data`. Optional query/body fields are omitted when unset. `workspaces.change_state` posts to `/v0/workspaces/{id}/{archive|unarchive|sleep}` with no body. Native category is `dev-tools`.

Official docs: https://www.conductor.build/docs/api. OpenAPI: https://api.conductor.build/v0/openapi.json. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
