# CloudConvert

Read-only international CloudConvert API v2 recipe for Lunaweb GmbH (Munich). Create an API key at [API keys](https://cloudconvert.com/dashboard/api/v2/keys) with `user.read` and `task.read`. The runner sends `Authorization: Bearer <apiKey>` and `Accept: application/json` to `https://api.cloudconvert.com/v2`.

Covered operations: credential-only `healthcheck` (`GET /users/me`), `jobs.list` (`GET /jobs` with optional `filter[status]`, `filter[tag]`, `page`, `per_page`), `jobs.get` (`GET /jobs/{jobId}?include=tasks`), `tasks.list` (`GET /tasks` with optional job/status/operation filters), and `conversion-types.list` (`GET /convert/formats`). Job/task create, wait, cancel, retry, and delete are omitted. Wait uses `sync.api.cloudconvert.com` in the pinned source and is not admitted.

Native category is `utility` (source Productivity/Design & Media). Native pins `api.cloudconvert.com`; region-specific hosts and the sandbox host are omitted. The upstream user-agent is not sent. Responses keep raw CloudConvert JSON under `data`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://cloudconvert.com/api/v2 and https://cloudconvert.com/api/v2/users. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `jobs.list`.
