# WaiverForever

Read-only WaiverForever OpenAPI recipe for WaiverForever / Aries App (Bellevue, Washington). Configure an API key from Settings / Integration. The runner sends `X-API-Key` to `https://api.waiverforever.com` plus `Accept: application/json`.

Selected operations are credential-only `healthcheck` (`GET /openapi/v1/auth/userInfo`), `user.get`, `templates.list`, `waivers.get`, and `waiver_requests.list` (required `template_id`). Signing-link and waiver-request writes are omitted. Official invalid-key status is HTTP 403.

Success envelopes include `result: true` and `msg: "success"`; those paths are not used as `bodyErrorPaths` because boolean `true` and the string `success` would trip. Native category is `forms`. `skipDnsValidation` is an upstream SDK concern; native pins `api.waiverforever.com`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.waiverforever.com/. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure an API key, call `healthcheck` with `{}`, then `templates.list`.
