# Gleap

Gleap admin REST API v3 recipe for Gleap GmbH (Austria; FN 534390 v). Create an API key and copy the Project ID from Project Settings → Security → API Key. The runner sends `Authorization: Bearer <apiKey>` and `Project: <projectId>` to `https://api.gleap.io/v3`.

This is the admin REST API (team-side tickets, contacts, messages, and help center), not the Conversations/S2S API that uses service-account tokens.

Covered operations: `healthcheck` (`GET /users/me`), contact list/get/create/update/search, ticket list/get/create/update/archive/search/counts/history, message list/create, teams, and help-center collections/articles. Hard deletes and the Conversations API are omitted.

Official docs live at `https://docs.gleap.io/documentation/server/api-overview`. Host is `api.gleap.io`. Native category is `dev-tools`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified.
