# ApiFlash

Read-only international ApiFlash screenshot recipe. Configure an access key from https://apiflash.com/dashboard/access_keys. The runner sends `access_key` as a query parameter to `https://api.apiflash.com` with `Accept: application/json`.

Healthcheck is documented `GET /v1/urltoimage/quota`. Screenshot capture is billed on unique successful captures and is not used as healthcheck. Native capture always sets `response_type=json` matching the pinned source so the response is JSON rather than a binary image.

Operations: `healthcheck`, `quota.get`, and `screenshots.capture`. Screenshot metadata HEAD against a caller-supplied URL is omitted because the host is unbounded. Official POST form encoding is omitted; native uses GET query parameters.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Fixtures are independently derived from official docs and the pinned source and do not represent live provider access. Live authentication is unverified.
