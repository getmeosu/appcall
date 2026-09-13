# BidSketch

Read-only international BidSketch REST API v1 recipe. Configure an API token from the workspace `/account/api_tokens` page (admin users only). The runner sends `Authorization: Token token="<token>"` and `Accept: application/json` to `https://bidsketch.com/api/v1`.

Healthcheck is documented `GET /proposals/stats.json`. Client and proposal list/get reads are included. Writes, client-scoped proposal lists, and proposal content are omitted.

Official docs quote the token in the Authorization header; native follows that quoted `Token token=` form from the BidSketch README and pinned runtime. Native omits the upstream User-Agent. Native category is `productivity` (source Productivity/Marketing).

The native key is `bidsketch`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://github.com/Bidsketch/bidsketch-api. Fixtures are independently derived and do not represent live provider access. Live authentication is unverified.
