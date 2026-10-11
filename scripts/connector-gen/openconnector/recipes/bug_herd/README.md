# BugHerd

BugHerd API v2 recipe for Splitrock Studio Pty Ltd (Australia) covering origin reads plus every Composio `BUGHERD_*` HTTP tool.

Configure the organization API key from BugHerd Settings > General Settings. The runner sends HTTP Basic authentication with the API key as username and `x` as the password.

## Operations

- Origin: `healthcheck` (`GET /api_v2/organization.json`), `projects.list`, `projects.get`, `tasks.list`, `tasks.get`.
- Organization: `organization.get` (same path as healthcheck).
- Users: `users.list`, `users.projects.list`, `users.tasks.list`.
- Projects: list active, create, update, delete, add member, add guest.
- Tasks: create and update. `tasks.list` now forwards tag, assignee, external ID, and date filters.
- Columns, comments, attachments (URL create, show, list), webhooks.
- `attachments.upload` is a handwritten multipart POST to `/api_v2/projects/{project_id}/tasks/{task_id}/attachments/upload`.

Official docs live at `https://docs.bugherd.com/api` (also linked as `https://www.bugherd.com/api_v2`). Host is `www.bugherd.com`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `projects.list`.
