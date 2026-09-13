# AccuWeather

**HOLD.** Official international AccuWeather Core Weather API recipe at `https://dataservice.accuweather.com`. Configure an API key from the AccuWeather developer subscriptions page. The runner sends `Authorization: Bearer <key>` and `Accept: application/json`.

Pinned OpenConnector actions are all billed Core Weather calls (Locations, Current Conditions, Forecasts). There is no cheap account/status/quota GET. The native credential validator is billed `GET /locations/v1/cities/autocomplete?q=New York`. Billable autocomplete is not used as a healthcheck. `operationQuality` remains unproven, so selection is HOLD.

Covered operations (not admitted): `locations.search`, `locations.geoposition`, `conditions.current`, `forecasts.daily`. Hourly forecasts and MinuteCast are omitted.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://developer.accuweather.com/documentation/authentication. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
