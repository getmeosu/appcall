# Adyntel

**HOLD.** Official international Adyntel ad-intelligence API at `https://api.adyntel.com`. Configure an API key from the Adyntel profile Integrations page plus the profile email. The runner sends `api_key` and `email` in the JSON body.

Pinned OpenConnector actions are billed ad-library searches. Official billing charges one credit per request. There is no cheap account/status/credits GET. The native credential validator is MCP SSE `GET https://mcp.adyntel.com/sse`, which is not a JSON REST healthcheck. Billable search is not used as healthcheck. `operationQuality` remains unproven, so selection is HOLD.

Covered operation (not admitted): `ads.meta.search` (`POST /facebook`). Google/LinkedIn/TikTok searches exist in the pinned source but are not statically extractable from the `adyntelAction` wrapper. TikTok ad-detail and domain-keyword lookups are omitted.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.adyntel.com/authorization. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
