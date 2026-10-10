# Rollbar

International **Rollbar API v1** recipe covering origin healthcheck, items, and project get plus every Composio `ROLLBAR_*` HTTP tool (17 tools, 20 operations). Healthcheck is an authenticated `GET /environments` probe and is not a Composio slug. Origin `items.list` / `items.get` are kept and are not Composio slugs.

Store a project or account access token as `apiKey`. Requests send `X-Rollbar-Access-Token` and `Accept: application/json` to `https://api.rollbar.com/api/1`. Account-level tools (teams, users, list-all-projects) need an account read token; project-level tools accept a project read token.

## Operations

- Auth: `healthcheck` (`GET /environments?page=1&limit=1`).
- Origin items: `items.list`, `items.get`.
- Projects: `projects.get` (`ROLLBAR_GET_PROJECT`, origin `projectId`), `projects.list`, `projects.teams.list`.
- Teams: `teams.list`, `teams.get`, `teams.projects.list`, `teams.users.list`, `teams.invites.list`, `teams.check_project`, `teams.check_user`.
- Users: `users.list`, `users.get`, `users.projects.list`, `users.teams.list`.
- Metrics (read POST): `metrics.occurrences`, `metrics.ttr`.
- RQL: `rql.jobs.list`.

Origin `projects.get` / `items.*` unwrap `response.result` (and healthcheck wraps the full envelope as `result`). New Composio tools return unwrapped `response.result` under `data`. Optional query and JSON body fields are omitted when unset. Team invitations use official `GET /team/{id}/invites`. Metrics POST bodies are JSON. No inbound webhook ops (Composio triggers = 0).

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.rollbar.com/reference. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
