# SurveyMonkey

International SurveyMonkey API v3 recipe (US host) covering origin healthcheck plus every Composio `SURVEY_MONKEY_*` HTTP tool (22 tools, 22 operations; `healthcheck` is `GET /v3/users/me` and maps to `SURVEY_MONKEY_GET_CURRENT_USER`).

Create a private app at the [developer portal](https://developer.surveymonkey.com/) and copy the long-lived access token from the app Settings. The runner sends `Authorization: Bearer` and `Accept: application/json` to `https://api.surveymonkey.com`.

## Operations

- `healthcheck`: `GET /v3/users/me` (`SURVEY_MONKEY_GET_CURRENT_USER`).
- Surveys: `surveys.list` (`GET /v3/surveys`), `surveys.get_summary` (`GET /v3/surveys/{id}`), `surveys.get` (`GET /v3/surveys/{id}/details`, expanded), `surveys.create` (`POST /v3/surveys`), `surveys.delete` (`DELETE /v3/surveys/{id}`), `surveys.trends.get` (`GET /v3/surveys/{id}/trends`).
- Collectors: `collectors.list` (`GET /v3/surveys/{id}/collectors`).
- Responses: `responses.list` (`GET /v3/surveys/{id}/responses`), `responses.bulk.list` (`GET /v3/surveys/{id}/responses/bulk`; Composio path id is `id`).
- Contacts: `contacts.list`, `contacts.bulk.list`, `contacts.create`, `contacts.bulk.create`, `contact-lists.list`, `contact-lists.create`, `contact-fields.list`.
- Account: `groups.list`, `webhooks.list` (outbound catalog; Composio triggers = 0), `survey-folders.create`, `survey-languages.list`, `benchmark-bundles.list`.

Successful JSON responses are raw SurveyMonkey JSON under AppCall `data`. `surveys.delete` maps an empty 204 to `{success: true}`. Optional query/body fields are omitted when unset. Native category is `forms`.

## Adaptations

Official docs allow a private-app access token as `Authorization: Bearer`; OAuth2 authorization-code is not implemented. EU (`api.eu.surveymonkey.com`) and Canada (`api.surveymonkey.ca`) are not expressed: the source maps a stored optional origin onto three hostnames, and the US value is `api.surveymonkey.com`, so a bounded wildcard plus required stored id cannot represent the mapping. The native template pins `api.surveymonkey.com`, matching the pinned executor. The upstream user-agent is not sent.

`include` on `surveys.list` and `collectors.list` is an array in the input schema and is sent as a comma-separated query value. Origin camelCase names (`surveyId`, `perPage`, `sortBy`) are unchanged on origin operations.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://api.surveymonkey.com/v3/docs and https://help.surveymonkey.com/en/surveymonkey/integrations/surveymonkey-api/. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
