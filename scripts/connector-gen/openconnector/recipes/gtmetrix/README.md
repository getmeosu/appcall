# GTmetrix

International GTmetrix REST API v2.0 recipe covering origin healthcheck plus every Composio `GTMETRIX_*` HTTP tool (20 tools, 21 operations).

Configure the GTmetrix API key. The runner sends HTTP Basic authentication with the API key as the username and a blank password to `https://gtmetrix.com/api/2.0`, plus `Accept: application/vnd.api+json`. JSON:API write bodies also send `Content-Type: application/vnd.api+json`.

## Operations

- Auth: `healthcheck` and `account.status` (`GET /status`).
- Locations / browsers / devices: origin `locations.list`, `locations.get`, `browsers.list`, plus `browsers.get`, `simulated_devices.list`, `simulated_devices.get`.
- Tests: `tests.start` (`POST /tests`), `tests.list`, `tests.get` (pending HTTP 200 only; completed tests return 303 which the runner outbound boundary blocks).
- Pages: `pages.list`, `pages.get`, `pages.delete`, `pages.retest`, `pages.latest_report.get`, `pages.reports.list`.
- Reports: `reports.get`, `reports.delete`, `reports.retest`, `reports.resource.get`.

`tests.start` consumes API credits. `tests.get` does not follow the 303 report redirect. Binary report resources are not JSON.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://gtmetrix.com/api. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure the API key, call `healthcheck` with `{}`, then `locations.list`.
