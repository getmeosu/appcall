# Amara

Read-only Amara REST API recipe. Configure an API key from the Amara account page. The runner sends `x-api-key` to `https://amara.org/api`.

Selected operations are `healthcheck` (`GET /users/me/`), `languages.list`, `videos.list`, `videos.get`, and `teams.list`. Video/subtitle writes, SRT/VTT fetches, and activity fanout are omitted. Healthcheck uses the pinned `me` user identifier rather than GET /languages/.

Native category is `productivity` (source Design & Media / Productivity).

A 2018-05-24 PCF mailing-list website incident is retained as historical evidence and does not block this international edition under the 2026-09-13 waiver.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://apidocs.amara.org/. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure `apiKey`, call `healthcheck` with `{}`, then `teams.list`.
