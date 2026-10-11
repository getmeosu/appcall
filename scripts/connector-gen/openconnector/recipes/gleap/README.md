# Gleap

Gleap admin REST API v3 recipe for Gleap GmbH (Austria; FN 534390 v). Create an API key and copy the Project ID from Project Settings → Security → API Key. The runner sends `Authorization: Bearer <apiKey>` and `Project: <projectId>` to `https://api.gleap.io/v3`.

This is the admin REST API (team-side tickets, contacts, messages, and help center), not the Conversations/S2S API that uses service-account tokens.

Covered operations follow the official admin OpenAPI at `https://api.gleap.io/api-docs.json` (jwt bearer), including the pinned open-connector actions and the other admin routes that return JSON. `POST /tickets/compose` and `DELETE /tickets/{ticketId}` are the pinned actions that were not already separate operations. CSV downloads, `POST /uploads` multipart, account signup, websocket auth, and the Conversations/S2S API are omitted. `articles.get` keeps `GET /helpcenter/articles/{articleId}`; the current spec reads an article with the collection id in the path.

Official docs live at `https://docs.gleap.io/documentation/server/api-overview`. Host is `api.gleap.io`. Native category is `dev-tools`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified.

Composio's GLEAP toolkit is 179 tools (version 20260615_00). The v3 admin routes already in this recipe cover that set except the calls that are not JSON admin routes: `GET /sessions/export` is a CSV download, and the Conversations/S2S API uses a service-account token. This revision adds the remaining JSON tools: list collection articles by `helpcenterCollectionId`, shared help center sources and answers, `POST /admin/identify`, and `POST /admin/track`.
