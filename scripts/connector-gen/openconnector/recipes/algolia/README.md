# Algolia

International Algolia Search API recipe. Configure the API key and application ID. The provider boundary derives the fixed hostname as `https://<applicationId>-dsn.algolia.net`; no separate hostname input is used. The API key must have `listIndexes` permission for `healthcheck` and `indices.list`, and `search` permission for `index.search` and `records.get`. The recipe uses fixed read-only endpoints and live smoke is unverified.
