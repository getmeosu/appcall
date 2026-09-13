# MeetGeek

Read-only international MeetGeek REST API recipe for the documented default region at `api.meetgeek.ai`. Configure a Public API key from Integrations → Public API. The runner sends `Authorization: Bearer`. Dedicated `api-eu.meetgeek.ai` and `api-us.meetgeek.ai` hosts are not admitted (API keys are region-specific; native templates cannot switch hosts).

Covered operations: credential-only `healthcheck` (`GET /v1/teams`), `meetings.list`, `meetings.get`, `meetings.summary`, and `meetings.highlights`. Uploads, deletes, transcripts, insights, and team-meeting list are omitted. Cursor pagination is caller-controlled.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.meetgeek.ai/api/getting-started/authorization. Fixtures are independently derived and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `meetings.list`.
