# OpenWeather

International OpenWeather API recipe. Configure the API key from the OpenWeather account API keys page. The runner sends `appid` as a query parameter to `https://api.openweathermap.org` plus `Accept: application/json`.

Selected operations cover geocoding (direct, reverse, zip), current weather and 5-day forecast by coordinates/city/zip/id, city search, air pollution current/forecast/history, and One Call 3.0 current, timemachine, day summary, and overview. Healthcheck remains `GET /geo/1.0/direct?q=London&limit=1`. Retired Weather Triggers are omitted; OpenWeather has no current vendor webhooks.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://openweathermap.org/appid. Fixtures are independently derived and do not represent live provider access.
