# Affinity

Read-only international Affinity API v2 recipe covering origin healthcheck plus every Composio `AFFINITY_*` HTTP tool (20 tools, 21 operations; healthcheck is an authenticated `GET /v2/auth/whoami` probe and is not a Composio slug).

Create an API key in Affinity Settings → Manage Apps. The runner sends `Authorization: Bearer` and `Accept: application/json` to `api.affinity.co`. v1 Basic Auth at `api-docs.affinity.co` is not used.

## Operations

- Auth: `healthcheck` and `users.me` (`GET /v2/auth/whoami`; `users.me` maps to AFFINITY_GET_CURRENT_USER).
- Persons: `persons.list`, `persons.get`, `persons.fields.list`, `persons.lists.list`, `persons.list_entries.list`.
- Companies: `companies.list`, `companies.get`, `companies.fields.list`, `companies.lists.list`, `companies.list_entries.list`.
- Opportunities: `opportunities.list`, `opportunities.get` (basic info, no field data).
- Lists: `lists.list`, `lists.get`, `lists.fields.list`, `lists.list_entries.list`.
- Saved views: `lists.saved_views.list`, `lists.saved_views.get`, `lists.saved_views.list_entries.list`.

Pagination is caller-controlled (`cursor`, `limit` 1–100). Provider `nextUrl`/`prevUrl` links are returned as data and never followed. Optional `ids`, `fieldIds`, and `fieldTypes` arrays are omitted when unset and exploded as repeated query keys when set (`?fieldIds=a&fieldIds=b`). Writes, notes, interactions, and saved-view board/dashboard types are not exposed.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache-2.0). Official docs: https://developer.affinity.co/pages/external-api-v2/getting-started. Live smoke is unverified; fixtures only.
