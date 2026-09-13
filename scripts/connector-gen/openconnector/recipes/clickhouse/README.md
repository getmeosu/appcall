# ClickHouse

**HOLD.** Official ClickHouse HTTP is served from a caller-supplied instance URL. Pinned OpenConnector requires an arbitrary public HTTP(S) `baseUrl` (placeholder `https://your-cluster.clickhouse.cloud:8443`, also `http://localhost:8123`). ClickHouse Cloud uses multi-label regional hosts such as `{id}.{region}.aws.clickhouse.cloud`, and self-hosted HTTP is first-class, so an Algolia/Grafana stored-id + bounded-wildcard pattern does not apply. This recipe is not admitted.

Documented operations (not admitted) would POST SQL with HTTP Basic to the HTTP interface:

- `healthcheck`: `SELECT currentDatabase() AS database, version() AS version` (pinned validator)
- `databases.list`: `system.databases` list (optional `pattern`)
- `tables.list`: `system.tables` list (optional `database` / `pattern`)

`execute_query` arbitrary SQL, `get_table_schema` / `get_database_schema` multi-request fanout, and `includeTables` / `includeColumns` extra queries are omitted. Native category is `dev-tools` (source Data is not in the Rust CATEGORIES allowlist). `your-cluster.clickhouse.cloud` in fixtures is the pinned definition placeholder, not a Cloud product host.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://clickhouse.com/docs/interfaces/http. Fixtures are independently derived and do not represent live provider access.
