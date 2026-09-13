# BoxHero

Read-only BoxHero Open API recipe for BGPworks (Seoul; global inventory product). Generate an API token from Settings → Integrations in the desktop web app. The runner sends `Authorization: Bearer` to `https://rest.boxhero-app.com`, plus `Accept: application/json`.

Covered operations: credential-only `healthcheck` and `team.get` (`GET /v1/team`), `items.list` (`GET /v1/items` with optional `cursor`/`limit`), `items.get` (`GET /v1/items/{item_id}`), and `locations.list` (`GET /v1/locations`). Writes and webhook registration are omitted.

Adaptations versus the pinned OpenConnector source: native category is `productivity` (source Data is not in Rust CATEGORIES); repeated `item_ids`/`location_ids` query arrays are omitted; HTTP 200 bodies with a populated `type` problem-details field are demoted via `http.errors.bodyErrorPaths`; the upstream user-agent is not sent. Responses keep raw BoxHero JSON under `data`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://www.boxhero.io/docs/faq/integrations-and-api/api and https://rest.boxhero-app.com/docs/api. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API token, call `healthcheck` with `{}`, then `team.get`.
