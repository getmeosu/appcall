# Nozbe

Read-only international **Nozbe REST API v1** recipe. Generate an API token under Settings → API tokens in Nozbe and store it as `apiKey`. Requests send `Authorization: apikey <token>` and `Accept: application/json` to `https://api4.nozbe.com/v1/api`.

## Operations

- `healthcheck`: `GET /teams?limit=1` with empty input (cheap authenticated team probe; pinned credential validator).
- `teams.list`: `GET /teams` with optional `limit` (1–10000), `offset`, and `sortBy`.
- `projects.list`: `GET /projects` with optional `limit`, `offset`, `sortBy`, `team_id`, and `is_single_actions`.
- `projects.get`: `GET /projects/{id}`; `id` is a required nonempty string.
- `tasks.list`: `GET /tasks` with optional `limit`, `offset`, `sortBy`, and `project_id`.

Successful responses are raw provider JSON under AppCall `data`. Comments and create/update/delete writes are omitted.

## Adaptations

Pinned source and official help/OpenAPI agree on `https://api4.nozbe.com/v1/api` and `Authorization: apikey <token>`. Help-center curl snippets show `Authorization: <API token>` without the prefix; native keeps the documented `apikey ` prefix from the help text, interactive Authorize box, and pinned source. Native category is `productivity` (source Communication is not in the Rust CATEGORIES allowlist). Official IDs are 16 alphanumeric characters; native strict schemas cannot express `maxLength`/`pattern`. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
