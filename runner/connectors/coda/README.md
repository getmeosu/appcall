# Coda (Superhuman Docs)

Coda API v1 operations covering the Composio CODA toolkit (110 tools). Coda's API remains available at `https://coda.io/apis/v1` after the July 2026 rename to Superhuman Docs. Configure a Coda API token (`apiKey`); the connector uses the provider's bearer token and does not invent OAuth scopes. Pagination is explicit: pass a returned `nextPageToken` as `pageToken`; `nextPageLink` is metadata and is never followed.

The origin/main read surface (`healthcheck`, `docs.list`, `docs.get`, `pages.list`, `tables.list`, `columns.list`, `rows.list`) is unchanged. Additional operations map 1:1 onto remaining Composio tools via the official Coda OpenAPI. Composio's four poll-style document/page triggers are omitted because Coda has no subscribe webhook API for them.

Source mapping reviewed from upstream snapshot `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (`src/providers/coda/{definition,actions,runtime}.ts`) plus official Coda API v1.
