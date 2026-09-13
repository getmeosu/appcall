# Avoma

Read-only Avoma REST API recipe for the international product at `api.avoma.com`. Configure a scoped API key from Settings → Organization → Developer; the runner sends `Authorization: Bearer`.

Covered operations: credential-only `healthcheck` (`GET /v1/users/`), `users.list`, `users.get`, `meetings.list`, and `meetings.get`. Recordings, transcriptions, and insights are omitted. CSV attendee and CRM array filters are omitted because the native query template cannot comma-join arrays the way the pinned source does. `meetings.list` requires `fromDate` and `toDate`.

The pinned credential validator uses `GET /v1/meetings/` with dummy 1970 dates; native healthcheck prefers listing users as a cheaper authenticated account read.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://dev.avoma.com/. Fixtures are independently derived and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `users.list`.
