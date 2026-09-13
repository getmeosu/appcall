# API-SPORTS

Read-only international API-SPORTS Football API v3 recipe. Configure an API key from the API-SPORTS dashboard. The runner sends it as the documented `x-apisports-key` header to `https://v3.football.api-sports.io`. Official docs allow only that header on GET requests, so native does not send `Accept` or the upstream user-agent.

Selected operations are `healthcheck` (`GET /timezone`, the pinned credential validator), `leagues.list` (`GET /leagues` with optional scalar filters), `teams.list` (`GET /teams` requiring `league` and `season`), `standings.get` (`GET /standings` requiring `league` and `season`), and `squad.list` (`GET /players/squads` requiring `team`). Predictions, live/search fanout, hyphen-joined id lists, and writes are omitted. HTTP 200 bodies with a populated `errors` array or object are treated as upstream errors via `bodyErrorPaths`.

Adaptations versus the pinned OpenConnector source: healthcheck reuses upstream action `football_list_leagues` because `/timezone` is validator-only; extra request headers from source are dropped to match official allowed-header docs; teams/standings/squads use required scalar filters instead of source `anyOf` fanout; list responses keep raw JSON under `data` instead of mapped wrappers; native category is `utility` (source Data is not in native CATEGORIES).

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://api-sports.io/documentation/football/v3. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure an API key, call `healthcheck` with `{}`, then `teams.list` with `league=39` and `season=2025`.
