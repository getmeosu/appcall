# Cloudflare MCP

**HOLD.** Official Cloudflare API MCP (Code Mode) is a streamable-HTTP MCP server at `https://mcp.cloudflare.com/mcp`. Pinned OpenConnector authenticates with a Bearer API token or OAuth (PKCE S256, `tokenEndpointAuthMethod: none`) and calls `listTools` / `callTool` (`docs`, `search`, `execute`). Native REST templates cannot express MCP sessions, SSE, or that OAuth shape. `GET /mcp` in this recipe is a documentation placeholder only and is not admitted.

Documented operations (not admitted):

- `healthcheck`: would be MCP `listTools` against `/mcp`
- `docs.search`: MCP `docs` tool with a required `query` argument

`search` and `execute` (sandboxed JavaScript against the Cloudflare OpenAPI spec and live API) are omitted. Native category is `dev-tools` (source Developer Tools/Infrastructure).

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://developers.cloudflare.com/agents/model-context-protocol/mcp-servers-for-cloudflare/ and https://github.com/cloudflare/mcp. Fixtures are independently derived placeholders and do not represent live provider access.
