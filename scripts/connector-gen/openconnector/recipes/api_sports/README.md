# API-SPORTS

Read-only international API-SPORTS Football API v3 recipe. Configure an API key from the API-SPORTS dashboard. The runner sends it as the documented `x-apisports-key` header to `https://v3.football.api-sports.io`. Official docs allow only that header on GET requests, so native does not send `Accept` or the upstream user-agent.

Covered operations (v0.2.0): `healthcheck` (`GET /timezone`), leagues, teams, standings, squads, countries, seasons, venues, fixtures (list/rounds/events/lineups/statistics/headtohead), players (list/topscorers/topassists), coaches, injuries, predictions, transfers, trophies, and odds. Hyphen-joined multi-id fanout and live `live=all` remain omitted. HTTP 200 bodies with a populated `errors` array or object are treated as upstream errors via `bodyErrorPaths`. List responses keep raw JSON under `data`. Native category is `utility`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://api-sports.io/documentation/football/v3. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure an API key, call `healthcheck` with `{}`, then `teams.list` with `league=39` and `season=2025`.
