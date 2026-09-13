# Clearout

Read-only Clearout REST API v2 recipe for Clearout Technology Private Limited (Bengaluru; global product at `api.clearout.io`). Configure an API token from Developer → API. The runner sends `Authorization: Bearer` to `https://api.clearout.io/v2`, plus `Accept: application/json`.

Covered operations: credential-only `healthcheck` and `credits.get` (`GET /email_verify/getcredits`), and `emails.verify` (`POST /email_verify/instant`). Email finder, bulk verify (multipart), and attribute-only verify endpoints are omitted. Instant verify consumes credits except for documented test addresses such as `valid@example.com`; do not use it as a healthcheck.

Adaptations versus the pinned OpenConnector source: caller-supplied `baseUrl` is omitted and the host is pinned to `api.clearout.io`; an older overview curl snippet omits the Bearer prefix, but native matches current docs and the pinned source; `timeout` minimum is 1000 ms per official docs; HTTP 200 bodies with a populated `error` object are demoted via `http.errors.bodyErrorPaths`. The upstream user-agent is not sent. Responses keep raw Clearout JSON under `data`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.clearout.io/developers/api/overview and https://docs.clearout.io/developers/api/email-verify. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API token, call `healthcheck` with `{}`, then `credits.get`.
