# Float

International **Float API v3** recipe at `https://api.float.com/v3`, covering origin healthcheck plus every Composio `FLOAT_*` HTTP tool (10 tools, 13 operations; healthcheck, accounts.list, and clients.list are not Composio slugs).

Configure an API token from Account Settings → Integrations and store it as `apiKey`. Requests send `Authorization: Bearer` and `Accept: application/json`.

## Operations

- Auth: `healthcheck` (`GET /accounts?per-page=1`).
- Accounts: `accounts.list`.
- People: `people.list`.
- Clients: `clients.list`.
- Projects: `projects.list`, `projects.get`, `projects.create`, `projects.update`.
- Allocations (official `/tasks`): `allocations.list`, `allocations.create`, `allocations.update`.
- Reports: `reports.people.get`, `reports.projects.get`.

List operations return the raw Float JSON array plus pagination from `X-Pagination-*` headers. Create/get/update/report operations return raw JSON under `data`. Optional query and body fields are omitted when unset. Official integer enums are used for status, active, non_billable, billable, and repeat_state. Native category is `scheduling`.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://developer.float.com/api_reference.html. Composio: https://docs.composio.dev/toolkits/float. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
