# Nozbe

International **Nozbe REST API v1** recipe covering the Composio `NOZBE_TEAMS` toolkit (48 indexed tools). Generate an API token under Settings → API tokens in Nozbe and store it as `apiKey`. Requests send `Authorization: apikey <token>` and `Accept: application/json` to `https://api4.nozbe.com/v1/api`.

## Operations

Origin/main five operations are retained:

- `healthcheck`: `GET /teams?limit=1` with empty input (cheap authenticated team probe; pinned credential validator).
- `teams.list`: `GET /teams` with optional `limit`, `offset`, `sortBy`, and `fields`.
- `projects.list`: `GET /projects` (NOZBE_TEAMS_LIST_PROJECTS).
- `projects.get`: `GET /projects/{id}` (NOZBE_TEAMS_GET_PROJECT).
- `tasks.list`: `GET /tasks` (NOZBE_TEAMS_LIST_TASKS).

The remaining Composio NOZBE_TEAMS tools are request-backed actions on the same host (comments, attachments, reminders, tags, tag assignments, project sections, project accesses, project groups, group assignments, task events, team members, users, poll new/updated tasks, and matching create/update/delete routes). Recipe operations equal runner operations.

## Adaptations

Pinned source and official help/OpenAPI agree on `https://api4.nozbe.com/v1/api` and `Authorization: apikey <token>`. Help-center curl snippets show `Authorization: <API token>` without the prefix; native keeps the documented `apikey ` prefix from the help text, interactive Authorize box, and pinned source. Native category is `productivity` (source Communication is not in the Rust CATEGORIES allowlist). Official IDs are 16 alphanumeric characters; native strict schemas cannot express `maxLength`/`pattern`. The upstream user-agent is not sent. Deletes whose OpenAPI responses have no JSON body return `{ id, deleted: true }` via `request.result`.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://nozbe.help/advancedfeatures/api/ and https://api4.nozbe.com/v1/api/openapi.yaml. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
