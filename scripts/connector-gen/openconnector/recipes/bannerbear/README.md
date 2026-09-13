# Bannerbear

Read-only international Bannerbear V2 REST API recipe. Configure a project API key from Project → Settings. The runner sends `Authorization: Bearer` to `https://api.bannerbear.com`. Full Access Master `project_id` and V5 keys/endpoints are not expressed.

Covered operations: credential-only `healthcheck` (`GET /v2/auth`), `templates.list`, `templates.get`, and `images.get`. Image create, including `sync.api.bannerbear.com`, is omitted as a write or billable render.

Adaptations versus the pinned OpenConnector source: responses are raw Bannerbear JSON under `data` (template lists are JSON arrays); optional page/limit/tag/name/extended/project_id query parameters are omitted; the upstream user-agent is not sent. Native category is `utility` (source Design & Media/Marketing).

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://developers.bannerbear.com/v2/. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure the project API key, call `healthcheck` with `{}`, then `templates.list`.
