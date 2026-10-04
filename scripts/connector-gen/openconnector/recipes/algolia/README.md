# Algolia

International Algolia Search API recipe. Configure the API key and application ID. Reads use `https://<applicationId>-dsn.algolia.net`; writes use `https://<applicationId>.algolia.net`. No separate hostname input is used. Search keys need `listIndexes`/`search`; indexing operations need `addObject`, `deleteObject`, `deleteIndex`, or `editSettings` as required by each endpoint. Live smoke is unverified.
