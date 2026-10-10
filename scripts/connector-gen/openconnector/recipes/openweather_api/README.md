# OpenWeather

International **OpenWeather API** recipe covering origin healthcheck plus every Composio `OPENWEATHER_API_*` HTTP tool (21 tools, 22 operations; healthcheck is an authenticated `GET /geo/1.0/direct?q=London&limit=1` probe and is not a Composio slug).

Configure the API key from the OpenWeather account API keys page and store it as `apiKey`. The runner sends `appid` as a query parameter plus `Accept: application/json`. JSON APIs use `https://api.openweathermap.org`. Weather map tiles use `https://tile.openweathermap.org`.

## Operations

- Auth: `healthcheck` (`GET /geo/1.0/direct?q=London&limit=1`).
- Geocoding: `geocoding.direct`, `geocoding.reverse`, `geocoding.zip`.
- Weather: `weather.current`, `weather.forecast`, `weather.find`.
- Air pollution: `air-pollution.current`, `air-pollution.forecast`, `air-pollution.history`.
- UV index: `uv.current`, `uv.forecast`, `uv.history` (legacy `/data/2.5/uvi*` endpoints still used by Composio).
- Weather map tiles are omitted because the provider returns binary PNG bytes, outside the declarative JSON response contract.
- Stations: `stations.list`, `stations.get`, `stations.create`, `stations.update`, `stations.delete`, `stations.measurements.list`, `stations.measurements.create`.
- Triggers: `triggers.list` (`GET /data/3.0/triggers`; retired Weather Triggers product, still a Composio tool).

`weather.current` and `weather.forecast` keep origin-required `lat` and `lon` and forward optional `q`, `id`, and `zip`. Successful JSON responses are raw OpenWeather JSON under AppCall `data`. Empty 204 responses (`stations.delete`, `stations.measurements.create`) map to `{success: true}`. Map tiles that are not JSON are returned as a string under `data`. Optional query/body fields are omitted when unset.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://openweathermap.org/appid. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
