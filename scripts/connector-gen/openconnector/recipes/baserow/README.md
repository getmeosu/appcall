# Baserow

**HOLD.** Official Baserow Cloud Database API at `https://api.baserow.io` is otherwise a bounded host (pinned OpenConnector hardcodes that Cloud URL; self-hosted is a separate edition without an extra field). Admission is blocked by unresolved **CVE-2026-19754** (SQL injection in formula `index()` on Baserow 2.3.3). Fluid Attacks reports no patch as of 2026-09-01; GitHub latest release remains 2.3.3.

Documented operations (not admitted) would send `Authorization: Token` to `/api/database`:

- `healthcheck` / `tables.list`: `GET /api/database/tables/all-tables/`
- `fields.list`: `GET /api/database/fields/table/{tableId}/`
- `rows.list`: `GET /api/database/rows/table/{tableId}/` with optional `user_field_names`, `search`, `order_by`, `page`, `size`
- `rows.get`: `GET /api/database/rows/table/{tableId}/{rowId}/`

Writes and nested `filters` JSON are omitted. Native category is `productivity` (source Productivity/Data). List-tables and list-fields return JSON arrays under `data`.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://baserow.io/user-docs/database-api. CVE: https://www.cve.org/CVERecord?id=CVE-2026-19754. Fixtures are independently derived and do not represent live provider access.
