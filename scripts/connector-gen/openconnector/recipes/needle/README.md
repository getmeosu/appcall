# Needle

Read-only Needle collections API recipe. Configure an API key from Needle settings (`ndl_...`) sent as `x-api-key` to `https://needle.app`. Native GET reads send `Accept: application/json` and omit the pinned helper's `content-type` and `user-agent` headers.

Covered operations: credential-only `healthcheck` (`GET /api/v1/collections`), `collections.list`, `collections.get`, `collections.stats.get`, and `collections.files.list`. Writes, URL file import, and collection search on `search.needle.app` are omitted. Native returns raw Needle JSON under `data` rather than the pinned `{collections}` / `{collection}` / `{files}` unwrap.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache-2.0). Official docs: https://docs.needle.app/docs/api-reference/needle-api/. Fixtures are independently derived from official docs plus pinned source; live authentication remains unverified.
