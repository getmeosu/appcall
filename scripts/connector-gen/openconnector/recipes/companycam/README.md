# CompanyCam

International **CompanyCam Core API** recipe covering Composio COMPANYCAM HTTP tools. Origin five stay on `https://api.companycam.com/v2`. Customer and project-task ops use `request.baseUrl` `https://api.companycam.com/v3`. Store a Bearer access token as `apiKey`.

## Operations

Recipe operations equal the prepared runner (25). Origin five: `healthcheck` (`GET /company`), `users.current`, `projects.list`, `projects.get`, `users.list`.

v2 Composio tools: project create/update/search, comments, photos, tags, labels.

v3 extras:

- `customers.create` / `customers.list` / `customers.update` on `/crm/customers`
- `projects.tasks.create` / `projects.tasks.list` / `projects.tasks.update` on `/projects/{projectId}/tasks`

No inbound webhook ops (Composio triggers = 0).

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived; live smoke is unverified.
