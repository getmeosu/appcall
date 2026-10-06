# Coda (Superhuman Docs)

Coda API v1 operations for docs, pages, tables, columns, rows, formulas, controls, mutations, and webhook-invoked automations. Coda's API remains available at `https://coda.io/apis/v1` after the July 2026 rename to Superhuman Docs. Configure a Coda API token (`apiKey`). Pagination is explicit: pass a returned `nextPageToken` as `pageToken`; `nextPageLink` is metadata and is never followed.

Composio lists four Coda triggers, all poll-based (`NEW_CODA_DOCUMENT`, `NEW_CODA_PAGE`, `SPECIFIC_CODA_PAGE_UPDATED`, and document deleted). Coda does not expose matching outbound EventOnly webhooks, so this connector does not invent bun webhook handlers. Use `automations.trigger` to invoke a Coda webhook-triggered automation.

Source mapping reviewed from upstream snapshot `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (`src/providers/coda/{definition,actions,runtime}.ts`), adapted to the declarative runner.
