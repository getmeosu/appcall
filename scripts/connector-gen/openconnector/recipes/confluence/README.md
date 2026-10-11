# Confluence

Confluence Cloud REST recipe. Origin/main already shipped 25 ops; this tree keeps those keys and the existing deepen, then applies the first-slice contract.

Store the Cloud hostname as required `site` (typically `{tenant}.atlassian.net`), the Atlassian account `email`, and an `apiToken`. Requests send `Authorization: Basic base64(email:apiToken)` to `https://{site}/wiki` with `Accept: application/json`.

## Setup

Required `site` is the bare hostname, for example:

- `acme.atlassian.net`

Create an API token at https://id.atlassian.com/manage/api-tokens. Official Basic auth: https://developer.atlassian.com/cloud/confluence/basic-auth-for-rest-apis/

OAuth 2.0 Bearer (`auth.atlassian.com` / `api.atlassian.com`) is documented by Atlassian and by pinned open-connector, but this native recipe is `api_key` `type` / `scopes` / `setup` only.

## First-slice operations (kept origin names)

- `healthcheck`: `GET /rest/api/user/current` (v1; v2 has no current-user endpoint)
- `space.list` (spaces.list): `GET /api/v2/spaces`
- `page.list` (pages.list): `GET /api/v2/pages`
- `page.get` (pages.get): `GET /api/v2/pages/{id}`
- `search.content` (content.search): `GET /rest/api/search` with CQL `title ~ "{query}"`. Arbitrary CQL is `search.cql`.

GET/DELETE send no body. JSON `Content-Type` is set only when a body is present. Native recipe auth is `type` / `scopes` / `setup` only. Inbound EventOnly webhooks keep `sideEffect` `"read"`.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and origin/main; live smoke is unverified: configure site + email + API token, call `healthcheck` with `{}`, then `space.list`.
