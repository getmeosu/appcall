# Avoma

Avoma REST API recipe for the international product at `api.avoma.com`. Configure a scoped API key from Settings → Organization → Developer; the runner sends `Authorization: Bearer`.

Covered operations: credential-only `healthcheck` (`GET /v1/users/`), users, meetings, meeting segments, recordings, transcriptions, notes, scorecards, meeting types, snippets, and revenue-intelligence timeline reads. EventOnly webhooks cover AINOTE and scheduler booking/cancel/reschedule events. `meetings.list` requires `fromDate` and `toDate`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://dev.avoma.com/. Fixtures are independently derived and do not represent live provider access.
