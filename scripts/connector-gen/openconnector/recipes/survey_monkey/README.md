# SurveyMonkey

Read-only international SurveyMonkey API v3 recipe (US host). Create a private app at the [developer portal](https://developer.surveymonkey.com/) and copy the long-lived access token from the app Settings. The runner sends `Authorization: Bearer` and `Accept: application/json` to `https://api.surveymonkey.com`.

## Operations

- `healthcheck`: `GET /v3/users/me` with empty input (pinned credential validator).
- `surveys.list`: `GET /v3/surveys` with optional `page`, `perPage` (sent as `per_page`, 1–1000), `title`, `folderId` (`folder_id`), `sortBy` (`sort_by`), `sortOrder` (`sort_order`), `startModifiedAt`, and `endModifiedAt`.
- `surveys.get`: `GET /v3/surveys/{surveyId}/details`.
- `collectors.list`: `GET /v3/surveys/{surveyId}/collectors` with optional `page` and `perPage`.
- `contact-lists.list`: `GET /v3/contact_lists` with optional `page` and `perPage`.

Writes, response bulk download, and rollups with comma-joined `collector_ids` are omitted. Native returns raw SurveyMonkey JSON under `data`. Native category is `forms`.

## Adaptations

Official docs allow a private-app access token as `Authorization: Bearer`; OAuth2 authorization-code is not implemented. EU (`api.eu.surveymonkey.com`) and Canada (`api.surveymonkey.ca`) are not expressed: the source maps a stored optional origin onto three hostnames, and the US value is `api.surveymonkey.com`, so a bounded wildcard plus required stored id cannot represent the mapping. The native template pins `api.surveymonkey.com`, matching the pinned executor. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://api.surveymonkey.com/v3/docs and https://help.surveymonkey.com/en/surveymonkey/integrations/surveymonkey-api/. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
