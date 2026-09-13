# Chatwork

Read-only Chatwork REST API v2 recipe. Configure an API token from Chatwork API settings. The runner sends `X-ChatWorkToken`. Official base URL is `https://api.chatwork.com/v2`.

Healthcheck is `GET /me`. Room get requires a positive integer `roomId`. My-tasks list accepts optional `assignedByAccountId` and `status` (`open`|`done`). Official empty-list HTTP 204 is not treated as JSON success. Message, task, and room writes are omitted.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://developer.chatwork.com/docs/endpoints. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
