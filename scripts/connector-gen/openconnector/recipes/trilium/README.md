# TriliumNext Notes

**HOLD.** TriliumNext Notes is self-hosted personal knowledge-base software. Official ETAPI docs use caller-owned hosts such as `myserver.com` and `localhost`. The pinned OpenConnector connector requires a caller-supplied instance URL. No Trilium Cloud hostname pattern is documented, so an Algolia/Grafana stored-id + bounded-wildcard host is not available. This recipe is not admitted.

Documented operations (not admitted) would send `Authorization: Bearer <ETAPI token>` (official docs also accept a raw token, or Bearer since 0.93.0):

- `healthcheck`: `GET /etapi/app-info`
- `notes.get`: `GET /etapi/notes/{noteId}`
- `notes.search`: `GET /etapi/notes?search=`
- `branches.get`: `GET /etapi/branches/{branchId}`
- `attributes.get`: `GET /etapi/attributes/{attributeId}`

Creates, updates, deletes, note content, and attachment upload fanout are omitted. Native category is `productivity`. `trilium.example.com` in fixtures is a docs-shaped example host, not a product cloud host.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://docs.triliumnotes.org/user-guide/advanced-usage/etapi and https://docs.triliumnotes.org/rest-api/etapi/. Fixtures are independently derived and do not represent live provider access.
