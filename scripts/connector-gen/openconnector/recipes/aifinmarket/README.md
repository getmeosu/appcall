# Wind AIFin Market

**EXCLUDE.** This is the mainland-China Wind (万得) AIFin Market MCP product at `aifinmarket.wind.com.cn` / `mcp.wind.com.cn`. Signup is by phone number; usage consumes 积分 billed through WeChat/Alipay. The pinned OpenConnector client speaks MCP streamable HTTP, fans out across seven server types, and applies computed argument transforms. Mainland-China-focused editions are excluded. MCP is not expressible as native REST.

Documented operations (not admitted):

- `healthcheck` / `tools.list` would be MCP `listTools` against `https://mcp.wind.com.cn/vserver_{serverType}/mcp/`
- Named stock/fund/index lookups, document search, and `call_tool` consume credits and require MCP `callTool`

Native category would be `banking-data` (source Finance / Data).

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official product: https://aifinmarket.wind.com.cn/#/home. Fixtures are independently derived placeholders and do not represent live provider access.
