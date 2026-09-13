# Cloudflare Docs

**HOLD.** Official Cloudflare Docs MCP is a public streamable-HTTP MCP server at `https://docs.mcp.cloudflare.com/mcp`. Pinned OpenConnector calls `withMcpClient` / `callTool` (`search_cloudflare_documentation`, `migrate_pages_to_workers_guide`). Native REST templates cannot express MCP sessions or SSE. `GET /mcp` in this recipe is a documentation placeholder only and is not admitted.

The Docs MCP server does not require authentication. Native omits `http.auth`. Native category is `dev-tools` (source Developer Tools/AI).

Documented operations (not admitted):

- `healthcheck`: would be MCP `callTool` against `/mcp`
- `docs.search`: MCP `search_cloudflare_documentation` with a required `query` argument

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://developers.cloudflare.com/agents/model-context-protocol/mcp-servers-for-cloudflare/. Fixtures are independently derived placeholders and do not represent live provider access.
