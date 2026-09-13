# Semantic Scholar

International Semantic Scholar Academic Graph API recipe. Configure an API key from the official API page and send it as `x-api-key`. Unauthenticated Graph access exists at a shared rate limit; this recipe always sends the stored key.

Operations are bounded reads: `healthcheck` (documented example paper lookup), `papers.get`, `authors.get`, `papers.authors.list`, and `authors.papers.list`. Paper and author IDs are URI-encoded. Caller-controlled `fields`, `limit`, and `offset` are never used to follow provider `next` offsets. Search, recommendations, batch POST, and datasets endpoints are omitted.

Healthcheck uses `GET /graph/v1/paper/649def34f8be52c8b66281af98ae884c09aef38b` rather than the pinned source's paper search validator, so the probe is a cheap authenticated read.

Pinned source: `oomol-lab/open-connector@33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache-2.0). Fixtures are supplied; live authentication is unverified.
