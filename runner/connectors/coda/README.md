# Coda (Superhuman Docs) pilot

Read-only Coda API v1 operations. Coda's API remains available at `https://coda.io/apis/v1` after the July 2026 rename to Superhuman Docs. Configure a Coda API token (`apiKey`); this pilot uses the provider's bearer token and does not invent OAuth scopes. Pagination is explicit: pass a returned `nextPageToken` as `pageToken`; `nextPageLink` is metadata and is never followed.

Source mapping reviewed from upstream snapshot `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (`src/providers/coda/{definition,actions,runtime}.ts`), adapted to the declarative runner. No mutation actions are included.
