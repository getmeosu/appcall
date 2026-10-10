# Needle

Needle collections, files, search, and local-connector REST recipe covering origin healthcheck plus every Composio `NEEDLE_*` HTTP tool (16 tools, 17 operations; healthcheck is an authenticated `GET /api/v1/collections` probe and is not a Composio slug).

Configure an API key from Needle settings (`ndl_...`) sent as `x-api-key` to `https://needle.app`. Collection search uses `https://search.needle.app`. Native requests send `Accept: application/json` and omit the pinned helper's `content-type` and `user-agent` headers except on JSON bodies.

## Operations

- Auth: `healthcheck` (`GET /api/v1/collections`).
- Collections: `collections.list`, `collections.get`, `collections.create`, `collections.stats.get`, `collections.search`.
- Collection files: `collections.files.list`, `collections.files.add`, `collections.files.delete`.
- Files: `files.upload_url.get`, `files.download_url.get`.
- Connectors: `connectors.list`.
- Local connectors: `local_connectors.list`, `local_connectors.get`, `local_connectors.create`, `local_connectors.files.add`, `local_connectors.files.delete`.

Successful JSON responses are raw Needle JSON under AppCall `data`. Optional query/body fields are omitted when unset. Collection file deletes that return 204 map to `{data:{}}`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache-2.0). Official docs: https://docs.needle.app/docs/api-reference/needle-api/. TypeScript SDK: https://github.com/needle-ai/needle-typescript. Fixtures are independently derived from official docs plus pinned source; live authentication remains unverified.
