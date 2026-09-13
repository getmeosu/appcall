# Basin

Read-only **Basin form backend API v1** recipe at `https://usebasin.com`. Configure an account API key from Account Settings → API Settings. Requests send `Authorization: Token` and `Accept: application/json`.

## Setup

Create or regenerate the Basin account API key and store it as `apiKey`. Form-scoped keys only see one form and may not be sufficient for project list healthcheck.

## Operations

- `healthcheck`: `GET /api/v1/projects?page=1` (pinned credential probe).
- `projects.list`: `GET /api/v1/projects` with optional `page` and `query`.
- `projects.get`: `GET /api/v1/projects/{project_id}`.
- `forms.list`: `GET /api/v1/forms` with optional `page` and `query`.
- `submissions.list`: `GET /api/v1/submissions/` with optional `form_id`, `filter_by`, `query`, `order_by`, and `date_range`.

Successful responses are raw provider JSON under AppCall `data`. Writes and webhook mutations are omitted. Native category is `forms` (source Productivity/Marketing).

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://docs.usebasin.com/developer-features/api-reference/. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
