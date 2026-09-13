# BALLDONTLIE World Cup

Read-only BALLDONTLIE FIFA World Cup API recipe. Create a free API key at https://app.balldontlie.io. The runner sends the raw key as the `Authorization` header (not `Bearer`) to `https://api.balldontlie.io`.

Covered operations: credential-only `healthcheck` (`GET /teams?seasons[]=2026&per_page=1`, free tier), `teams.list`, and `standings.list` (`GET /group_standings`, ALL-STAR+). Odds, player props, matches, and other GOAT-tier or billable search endpoints are omitted. `list_matches` is omitted because official docs/OpenAPI use cursor pagination and `team_ids[]` while the pinned source sends `page`/`team_id`. `get_match` is omitted because official OpenAPI does not document `GET /matches/{id}`. `list_stadiums` is omitted because static action extraction only sees the four direct `defineProviderAction` calls.

Optional `season` is constrained to documented World Cup years 2018, 2022, and 2026.

Native category is `utility` (sports data API; native CATEGORIES has no sports bucket).

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `teams.list`.
