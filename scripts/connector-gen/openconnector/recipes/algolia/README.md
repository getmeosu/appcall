# Algolia

International Algolia Search API recipe. Configure the API key and application ID. Reads use `https://<applicationId>-dsn.algolia.net`; writes use `https://<applicationId>.algolia.net`. No separate hostname input is used. Search keys need `listIndexes`/`search`; indexing operations need `addObject`, `deleteObject`, `deleteIndex`, or `editSettings` as required by each endpoint. Live smoke is unverified.

## Composio deepening (0.3.0)

Adds the remaining official Algolia REST operations that correspond to Composio's 133-tool catalog, including Search, Recommend, Insights, Analytics/A/B tests, Ingestion, Query Suggestions, Personalization, dictionaries, logs, API keys, and Usage.

Regional APIs that cannot interpolate a caller-supplied `region` into the hostname (SSRF control: only required setup fields may appear in hosts) use:

- Analytics / A/B tests: `https://analytics.algolia.com` (geo-routed)
- Ingestion: `https://data.us.algolia.com`
- Query Suggestions: `https://query-suggestions.us.algolia.com`
- Classic Personalization: `https://personalization.us.algolia.com`
- Advanced Personalization: `https://ai-personalization.us.algolia.com`
- Insights: `https://insights.algolia.io`
- Usage: `https://usage.algolia.com`

`ALGOLIA_INIT_INSIGHTS` (SDK initializer) and `ALGOLIA_GET_OBJECT_POSITION` (client-side scan of a previous search payload) have no HTTP endpoint and are not implemented.

