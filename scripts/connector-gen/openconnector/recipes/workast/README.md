# Workast

Read-only Workast REST recipe. Generate an API token from Preferences → API in the Workast web app. The runner sends `Authorization: Bearer` plus `Accept: application/json` to `https://api.todobot.io` (the documented TodoBot-era Cloud API host).

## Operations

- `healthcheck`: `GET /user/me` with empty input (pinned credential validator).
- `spaces.search`: `GET /list` with optional `limit` (1–200), `skip`, and `name`.
- `spaces.get`: `GET /list/{spaceId}`.
- `tasks.list`: `GET /list/{spaceId}/task` with optional `skip` and `limit`.
- `tasks.get`: `GET /task/{taskId}`.

Creates, updates, and complete-task writes are omitted. Native returns raw JSON under `data` (list endpoints may be arrays). Boolean/enum filters (`onlyUserLists`, `statusIs`, `type`, `sort`, `order`) are omitted.

## Adaptations

Official token help points at https://developers.workast.com; the live host used by pinned source, Pipedream, and Boost.space is `api.todobot.io`. Native uses that bounded host, not a caller-supplied URL. Native category is `productivity`. The upstream user-agent is not sent. OpenAPI HTML was not retrievable from developers.workast.com in this authoring environment; paths follow pinned source plus the official token article.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official token docs: https://www.workast.com/help/article/how-to-generate-an-api-token/. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure an API token, call `healthcheck` with `{}`, then `spaces.search`.
