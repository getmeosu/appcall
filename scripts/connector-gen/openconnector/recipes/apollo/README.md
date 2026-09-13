# Apollo

Read-only Apollo.io REST API recipe for the international product at `api.apollo.io`. Configure a master API key from Settings > Integrations > API Keys. The runner sends `x-api-key`. Distinct from Apollo Global Management.

Covered operations: credential-only `healthcheck` (`POST /api/v1/usage_stats/api_usage_stats`, official 0 credits, no body), `people.search` (0 credits), `organizations.search` (1 credit per page; not used as healthcheck), and `organizations.enrich`. People match enrichment and writes are omitted. Search filters are scalar query parameters on POST; array filters such as `person_titles[]` are omitted. Official Cache-Control and Content-Type headers are omitted on body-less POSTs.

Native category is `crm` (source Marketing / Data). Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.apollo.io/reference/view-api-usage-stats. Fixtures are independently derived and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `people.search`.
