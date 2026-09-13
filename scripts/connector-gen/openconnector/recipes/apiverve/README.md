# APIVerve

Read-only international APIVerve REST recipe. Configure the dashboard API key from https://dashboard.apiverve.com. The runner sends `X-API-Key` and `Accept: application/json` to `https://api.apiverve.com`. Official docs also show `x-api-key`; HTTP header names are case-insensitive.

This recipe is **HOLD**. Healthcheck is omitted rather than using a billable lookup. Pinned actions have no account/status/quota GET. Official `GET /v1/advice` (the pinned credential validator) costs 2 credits per successful call. Official never-billed `GET /v1/analytics` is documented as a health/quota probe, but it is not a pinned upstream action and cannot be fabricated. Remaining reads are dictionary, airport, airline, and currency lookups.

APIVerve answers failures as `{status:"error", error:"...", data:null}`. Success uses `{status:"ok", error:null, data:...}`. Native `bodyErrorPaths` is `["error"]` so a non-null error string is a connector error even on HTTP 200; `status` is not used because the success value `ok` is a non-empty string.

Operations: `dictionary.get`, `airports.get`, `airlines.get`, and `currency.convert`. Airline lookup requires `iata` (minLength 2) and omits the pinned source name-search variant. IATA and currency codes use minLength rather than a letter pattern because native strict-generated schemas reject `pattern`. Official examples use uppercase.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Fixtures are independently derived from official docs and the pinned source and do not represent live provider access. Live authentication is unverified.
