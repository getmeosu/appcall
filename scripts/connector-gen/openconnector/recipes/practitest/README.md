# PractiTest

Read-only international PractiTest REST API v2 recipe (PractiTest Ltd., Rehovot). Configure a personal or account API token from Account Settings or Personal Settings. The runner sends `PTToken` plus `Accept: application/json` to `https://api.practitest.com/api/v2`. Basic `email:token` and `api_token` query authentication are documented alternatives not used here.

## Operations

- `healthcheck`: `GET /projects.json?page[number]=1&page[size]=1` with empty input (pinned credential validator).
- `projects.list`: `GET /projects.json` with optional `page` and `pageSize`.
- `project.get`: `GET /projects/{projectId}.json` with required `projectId`.
- `tests.list`: `GET /projects/{projectId}/tests.json` with required `projectId` and optional `page`, `pageSize`, `filterId`, `nameExact`, `nameLike`, and `relationships`.
- `test.get`: `GET /projects/{projectId}/tests/{testId}.json` with required `projectId` and `testId`, optional `relationships`.

Test create/update/delete writes and `displayIds` comma-join filters are omitted. Native returns raw PractiTest JSON:API under `data`.

## Adaptations

Pinned source and official API v2 docs agree on `https://api.practitest.com/api/v2` and the `PTToken` header. Native category is `dev-tools` (source Developer Tools/Productivity). `displayIds` array encoding is omitted because native query templates would emit repeated keys instead of the source comma-join. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://www.practitest.com/api-v2/. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
