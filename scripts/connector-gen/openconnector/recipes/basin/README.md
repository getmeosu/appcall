# Basin

International **Basin form backend API v1** recipe at `https://usebasin.com`, covering origin healthcheck plus every Composio `BASIN_*` HTTP tool (19 tools, 20 operations; healthcheck is an authenticated `GET /api/v1/projects?page=1` probe and is not a Composio slug).

Configure an account API key from Account Settings → API Settings and store it as `apiKey`. Requests send `Authorization: Token` and `Accept: application/json`. Form-scoped keys only see one form and may not be sufficient for the project-list healthcheck.

## Operations

- Auth: `healthcheck` (`GET /api/v1/projects?page=1`).
- Projects: `projects.list`, `projects.get`, `projects.create`, `projects.update`, `projects.delete`.
- Forms: `forms.list`, `forms.get`, `forms.create`, `forms.update`, `forms.delete`.
- Submissions: `submissions.list`, `submissions.delete`.
- Form webhooks: `form_webhooks.list`, `form_webhooks.get`, `form_webhooks.create`, `form_webhooks.update`, `form_webhooks.delete` (outbound submission forwarding; Composio triggers = 0).
- Domains: `domains.list`.
- Form views: `form_views.list` (legacy Form Builder / Form.io views).

Create/update bodies use Basin's Rails wrappers (`form`, `project`, `form_webhook`). Optional query and body fields are omitted when unset. `submissions.delete` maps empty official 200 bodies to `{success: true}`. Native category is `forms`.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://docs.usebasin.com/developer-features/api-reference/. Swagger: https://usebasin.com/api_docs/index.html. Composio: https://docs.composio.dev/toolkits/BASIN. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
