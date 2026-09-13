# Autom

Read-only international **Autom SERP API** recipe. Create an API key in the Autom dashboard API Keys page and store it as `apiKey`. Requests send `x-api-key` and `Accept: application/json` to `https://api.autom.dev`.

## Operations

- `healthcheck`: `GET /v1/usage` (free authenticated read; same path as the pinned credential validator and official quick start).
- `usage.get`: `GET /v1/usage`.
- `google-countries.find`: `GET /v1/finder/google-countries?query=` (0 credits).
- `google-languages.find`: `GET /v1/finder/google-languages?query=` (0 credits).
- `google-locations.find`: `GET /v1/finder/google-locations?query=` (0 credits).

Successful usage responses are raw provider JSON objects under AppCall `data`. Finder endpoints return raw JSON arrays under `data`. Billed Google/Bing/Brave search endpoints (1 credit per successful call) are omitted.

## Adaptations

Pinned source and official docs agree on `https://api.autom.dev` and `x-api-key`. Native category is `dev-tools` (source Data/Developer Tools/Marketing). Distinct from auto.dev VIN APIs. Official Finder docs mention Piloterr in the locations copy; native follows the Autom path and host.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
