# BT Panel MCP

**EXCLUDE.** This is the mainland-China BT Panel (宝塔面板) MCP product at `www.bt.cn` / `docs.bt.cn`, operated by 广东堡塔安全技术有限公司. Plans are prepaid in RMB; official copy names 政企 customers. aaPanel is a separate overseas edition and is not this provider. Mainland-China-focused editions are excluded.

Pinned OpenConnector requires a caller-supplied MCP Server URL ending in `/mcp` and an authorization Bearer token. The client speaks MCP streamable HTTP (`listTools` / `callTool`), which native REST templates cannot express. There is no Algolia-style stored-id + bounded-wildcard host.

Documented operations (not admitted):

- `healthcheck` / `tools.list` would be MCP `listTools` against the caller-owned `/mcp` endpoint
- `call_tool` is omitted because it can run server commands, firewall changes, and deletes

Native category would be `dev-tools` (source Infrastructure / Developer Tools).

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official product: https://www.bt.cn/ and https://docs.bt.cn/ai-ops/mcp/installation. Fixtures are independently derived placeholders and do not represent live provider access.
