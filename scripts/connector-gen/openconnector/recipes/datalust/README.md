# Datalust Seq

**HOLD.** Seq is a self-hosted structured-log server. Official product and pricing pages state that log data stays on the customer's infrastructure and is never sent to Datalust. The pinned OpenConnector connector requires a caller-supplied Seq root URL. No Seq Cloud hostname pattern is documented, so an Algolia/Grafana stored-id + bounded-wildcard host is not available. This recipe is not admitted.

Documented operations (not admitted) would send `X-Seq-ApiKey` and `Accept: application/vnd.datalust.seq.v14+json`:

- `healthcheck` / `signals.list`: `GET /api/signals`
- `signals.get`: `GET /api/signals/{signalId}`
- `saved-queries.list`: `GET /api/sqlqueries`
- `saved-queries.get`: `GET /api/sqlqueries/{queryId}`

Event search, SQL query execution, CLEF ingest, and writes are omitted. Native category is `dev-tools` (source Data / Developer Tools). `seq.example.com` in fixtures is the docs example host, not a product cloud host.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://datalust.co/docs/using-the-http-api and https://datalust.co/docs/server-http-api. Fixtures are independently derived and do not represent live provider access.
