# AnySearch

This recipe is **HOLD**. Official international AnySearch REST search at `https://api.anysearch.com`. Configure an API key from https://anysearch.com/console/api-keys. The runner would send `Authorization: Bearer` plus `Accept: application/json`.

Pinned OpenConnector has no cheap account/status/quota GET. The native credential validator is billed `POST /v1/search` (HTTP 402 quota is treated as authenticated). Billable search is not used as healthcheck. REST success is HTTP 200 with numeric `code: 0`; native `bodyErrorPaths` cannot express that envelope because a finite number is treated as an error. MCP JSON-RPC tools at `/mcp` (`get_sub_domains`, `batch_search`, `extract`) are omitted.

Covered operation (not admitted): `search` (`POST /v1/search` with required `query` and optional `max_results`).

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://anysearch.com/ and https://github.com/anysearch-ai/anysearch-mcp-server. Fixtures are independently derived and do not represent live provider access. Live authentication remains unverified.
