# Braze

**HOLD.** Official Braze REST is served from a cluster-specific origin copied from Settings > APIs and Identifiers. Pinned OpenConnector requires a caller-supplied HTTPS `restEndpoint` (placeholder `https://rest.iad-01.braze.com`). Published clusters include `rest.iad-0N.braze.com`, `rest.us-10.braze.com`, `rest.fra-0N.braze.eu`, and `rest.au-01` / `id-01` / `jp-01` / `kr-01.braze.com`, so an Algolia/Grafana stored-id plus one bounded wildcard does not apply. This recipe is not admitted.

Documented operations (not admitted) would send `Authorization: Bearer` to the cluster origin:

- `healthcheck` / `campaigns.list`: `GET /campaigns/list`
- `campaigns.get`: `GET /campaigns/details?campaign_id=`
- `canvases.list`: `GET /canvas/list`
- `canvases.get`: `GET /canvas/details?canvas_id=`

Writes, analytics series, and `last_edit.time[gt]` are omitted. Native category is `email-marketing` (source Marketing/Data are not in the Rust CATEGORIES allowlist). `rest.iad-01.braze.com` in fixtures is the official example cluster, not a live workspace.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://www.braze.com/docs/api/basics. Fixtures are independently derived and do not represent live provider access.
