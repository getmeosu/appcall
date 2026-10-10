# Semantic Scholar

International Semantic Scholar Academic Graph, Recommendations, and Datasets API recipe covering the Composio `SEMANTICSCHOLAR` toolkit (21 tools).
Configure an API key from the official API page and send it as `x-api-key`. Unauthenticated Graph access exists at a shared rate limit; this recipe always sends the stored key.

## Operations

Origin bounded reads are unchanged: `healthcheck` (documented example paper lookup), `papers.get`, `authors.get`, `papers.authors.list`, and `authors.papers.list`.
Added Composio tools call the official Graph, Recommendations, and Datasets HTTP endpoints. Paper and author IDs are URI-encoded. Caller-controlled `fields`, `limit`, `offset`, and `token` are never used to follow provider `next` offsets.

Successful responses are raw provider JSON under AppCall `data`. Batch author/paper lookups and release lists return JSON arrays. `papers.search.relevance` is the deprecated Composio relevance-search alias of `papers.search` (same GET `/graph/v1/paper/search` endpoint).

## Adaptations

Origin ops keep their request shapes, including `papers.authors.list` / `authors.papers.list` limit caps of 100. New citation, reference, author-search, snippet, and bulk-search ops use the documented API maxima. Native category is `utility`.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
