# OpenWeather

Read-only international OpenWeather API recipe. Configure the API key from the OpenWeather account API keys page. The runner sends `appid` as a query parameter to `https://api.openweathermap.org` plus `Accept: application/json`.

Selected operations are `healthcheck` (`GET /geo/1.0/direct?q=London&limit=1`, the pinned credential validator), `geocoding.direct` (`GET /geo/1.0/direct`), `weather.current` (`GET /data/2.5/weather`), `weather.forecast` (`GET /data/2.5/forecast`), and `air-pollution.current` (`GET /data/2.5/air_pollution`). Current weather and forecast require `lat` and `lon` rather than the pinned exclusive city/zip selector. Tile host `tile.openweathermap.org`, One Call 3.0 UV helpers, weather-station writes, and retired Weather Triggers are omitted.

Healthcheck consumes one Geocoding call from the free-plan quota. Official docs and pinned actions have no cheap account/status/quota GET.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://openweathermap.org/appid. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure the API key, call `healthcheck` with `{}`, then `weather.current` with latitude and longitude.
