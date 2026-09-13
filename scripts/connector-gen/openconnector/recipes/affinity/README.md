# Affinity

Read-only international Affinity API v2 recipe. Create an API key in Affinity Settings → Manage Apps. The runner sends `Authorization: Bearer` to `api.affinity.co`. v1 Basic Auth at `api-docs.affinity.co` is not used.

Covered operations: credential-only `healthcheck` (`GET /v2/auth/whoami`), `persons.list`, `persons.get`, and `companies.list`. Pagination is caller-controlled (`cursor`, `limit` 1–100). Provider `nextUrl`/`prevUrl` links are returned as data and never followed. Repeated `ids`/`fieldIds`/`fieldTypes` query arrays, writes, list-entry field data, and saved-view fanout are not exposed.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache-2.0). Live smoke is unverified; fixtures only.
