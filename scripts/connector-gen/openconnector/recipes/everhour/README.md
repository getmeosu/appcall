# Everhour

International Everhour REST API recipe covering the Composio EVERHOUR toolkit (38 tools). Configure an API key from the bottom of the Everhour profile page. The runner sends the documented `X-Api-Key` header plus `Accept: application/json` to `https://api.everhour.com`.

Origin/main operations are retained:

- `healthcheck`: `GET /users/me` (EVERHOUR_GET_USER_PROFILE).
- `users.list`: `GET /team/users` (EVERHOUR_LIST_TEAM_MEMBERS).
- `projects.list`: `GET /projects` with optional `query`/`limit`/`platform`/`status` (EVERHOUR_LIST_PROJECTS).
- `projects.get`: `GET /projects/{projectId}` (EVERHOUR_GET_PROJECT).
- `time.list`: `GET /team/time` (AppCall-only).

The remaining Composio EVERHOUR tools are request-backed actions for clients, sections, tasks, timers, timecards, timesheet approvals, expenses, invoices, tags, webhooks, and the workspace team record. Recipe operations equal runner operations.

Native `encodeURIComponent` keeps `%3A` for colon-bearing integration project ids such as `as:123456`. List/get responses keep raw JSON under `data`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://everhour.docs.apiary.io/. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
