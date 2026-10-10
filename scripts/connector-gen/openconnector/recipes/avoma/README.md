# Avoma

International Avoma REST API v1 recipe for `api.avoma.com`. Configure a scoped API key from Settings → Organization → Developer; the runner sends `Authorization: Bearer`.

Covered operations: credential-only `healthcheck` (`GET /v1/users/`) plus every Composio `AVOMA_*` HTTP tool (17 tools, 18 operations). `users.get` is kept from origin and maps to `AVOMA_GET_USER`.

`meetings.analysis.get` is handwritten: it issues three authenticated GETs (insights, topical/speaker segments, sentiments) and returns `{insights, segments, sentiments}` under `data`. `configuration.list` selects one official catalog path (`custom_categories`, `smart_categories`, `scorecards`, `template`, `meeting_type`, `meeting_outcome`). `webhooks.list` reads subscription metadata only and does not fetch signing secrets. `meetings.list` keeps origin `fromDate`/`toDate`/`page`/`pageSize`/`order` and adds official attendee, CRM, call-type, and duration filters.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://dev.avoma.com/. Fixtures are independently derived and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `users.list`.
