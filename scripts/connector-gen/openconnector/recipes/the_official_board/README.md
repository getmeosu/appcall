# The Official Board

Read-only international **The Official Board REST API** recipe. The Official Board is the org-chart and executive directory at [theofficialboard.com](https://www.theofficialboard.com/). Create a REST token under [account preferences](https://www.theofficialboard.com/account/preferences/rest-api) and store it as `apiKey`. Requests send `token: <apiKey>` and `Accept: application/json` to `https://rest.theofficialboard.com/rest`.

## Operations

- `healthcheck`: `GET /test/token` with empty input (cheap authenticated token probe; does not consume org-chart search tokens).
- `watchlist.list`: `GET /orgchart/watch` with optional `amount` and `page` (both ≥ 1).
- `companies.search`: `GET /company/search` with required `companyName` and optional `amount` (1–50).
- `orgchart.get`: `GET /company/orgchart` with required `id`.
- `executives.search`: `GET /executive/search` with required `name` and optional `amount` (1–200).

Successful responses are raw Official Board JSON under AppCall `data`. Writes, PDF/XLSX export, biography, colleagues, and recent-news reads are omitted.

## Adaptations

Pinned source and official/Pipedream docs agree on the `token` header and `GET /test/token`. Native requires `companyName` on company search (pinned source left it optional). Native category is `crm` (source Data is not in the Rust CATEGORIES allowlist). The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
