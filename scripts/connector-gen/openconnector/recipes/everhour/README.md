# Everhour

Read-only international Everhour REST API recipe. Configure an API key from the bottom of the Everhour profile page. The runner sends the documented `X-Api-Key` header plus `Accept: application/json` to `https://api.everhour.com`.

Selected operations are `healthcheck` (`GET /users/me`, the pinned credential validator), `users.list` (`GET /team/users`), `projects.list` (`GET /projects` with optional `query`/`limit`/`platform`), `projects.get` (`GET /projects/{projectId}`), and `time.list` (`GET /team/time` with optional `from`/`to`/`page`/`limit`). Timer writes, time-record creates, and task search are omitted.

Adaptations versus the pinned OpenConnector source: native `encodeURIComponent` keeps `%3A` for colon-bearing integration project ids such as `as:123456` (source rewrites `%3A` back to `:`); list/get responses keep raw JSON under `data` instead of `{user}`/`{users}`/`{projects}`/`{timeRecords}` wrappers; source-only `from <= to` validation is omitted; the upstream user-agent is not sent.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://everhour.docs.apiary.io/. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure an API key, call `healthcheck` with `{}`, then `projects.list` with `{}`.
