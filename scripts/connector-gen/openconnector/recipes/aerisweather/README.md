# Xweather (AerisWeather)

**HOLD.** Official international Xweather Weather API at `https://data.api.xweather.com`. Register an application to get `client_id` and `client_secret`. The runner sends those as query parameters.

Pinned OpenConnector actions are Places, Observations, and Forecasts lookups. Official cost headers apply token usage to every 2xx response. There is no cheap account/status/quota GET. The native credential validator is `GET /places/98109`, a billed place lookup. Billable lookup is not used as healthcheck. `operationQuality` remains unproven, so selection is HOLD.

Covered operations (not admitted): `places.get`, `observations.get`, `forecasts.get`. HTTP 200 bodies with a populated `error` object are demoted via `http.errors.bodyErrorPaths`. Native category is `utility` (source Location/Data).

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://www.xweather.com/docs/weather-api/getting-started/authentication. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
