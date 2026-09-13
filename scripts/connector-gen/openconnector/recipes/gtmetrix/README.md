# GTmetrix

Read-only GTmetrix REST API v2.0 recipe. Configure the GTmetrix API key. The runner sends HTTP Basic authentication with the API key as the username and a blank password to `https://gtmetrix.com/api/2.0`, plus `Accept: application/vnd.api+json`.

Selected operations are `healthcheck` and `account.status` (`GET /status`), `locations.list` (`GET /locations`), `locations.get` (`GET /locations/{location_id}`), and `browsers.list` (`GET /browsers`). Starting a URL test is omitted because it consumes API credits and is not a healthcheck. `get_test` is omitted because completion uses HTTP 303 and Retry-After shaping the native template does not express.

Adaptations versus the pinned OpenConnector source: native Basic auth uses `http.auth.basic` with an empty password template; the upstream user-agent is not sent; responses keep raw JSON:API under `data` instead of unwrapping `data.attributes`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://gtmetrix.com/api. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure the API key, call `healthcheck` with `{}`, then `locations.list`.
