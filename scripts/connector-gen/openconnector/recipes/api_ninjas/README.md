# API Ninjas

HOLD. International API Ninjas REST recipe at `https://api.api-ninjas.com`. Configure the dashboard API key from https://api-ninjas.com. The runner sends `X-Api-Key` and `Accept: application/json`.

This recipe is **HOLD**. Healthcheck is omitted rather than using a billed lookup. Every pinned action (geocode, reverse geocode, weather, forecast, air quality, timezone) consumes monthly API-call quota. The pinned credential validator is `GET /v1/timezone?timezone=UTC`. Official never-billed `GET /v1/analytics` exists on Professional/Enterprise plans only, authenticates with a query `api_key` instead of `X-Api-Key`, and is not a pinned upstream action, so it cannot be fabricated as healthcheck.

Operations: `geocode`, `reverse.geocode`, `weather.current`, and `timezone.get`. Weather follows the pinned lat/lon path; official premium city lookup fields are omitted. Timezone requires an IANA name (free-tier path) and omits premium location fields.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Fixtures are independently derived from official docs and the pinned source and do not represent live provider access. Live authentication is unverified.
