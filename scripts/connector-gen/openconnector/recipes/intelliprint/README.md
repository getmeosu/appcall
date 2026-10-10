# Intelliprint

International **Intelliprint REST API v1** recipe covering origin healthcheck plus every Composio `INTELLIPRINT_*` HTTP tool (21 tools, 22 operations; healthcheck is an authenticated `GET /prints?limit=1` probe and is not a Composio slug).

Create an API key under https://account.intelliprint.net/api_keys and store it as `apiKey`. Requests send `Authorization: Bearer <key>` and `Accept: application/json` to `https://api.intelliprint.net/v1`.

## Operations

- Auth: `healthcheck` (`GET /prints?limit=1`).
- Print jobs: `prints.list`, `prints.get`, `prints.create`, `prints.delete`.
- Backgrounds: `backgrounds.list`, `backgrounds.get`, `backgrounds.create`, `backgrounds.update`, `backgrounds.delete`.
- Mailing lists: `mailingLists.list`, `mailingLists.get`, `mailingLists.create`, `mailingLists.update`, `mailingLists.delete`.
- Recipients: `mailingListRecipients.list`, `mailingListRecipients.get`, `mailingListRecipients.create`, `mailingListRecipients.update`, `mailingListRecipients.delete`.
- Templates: `templates.list` (`GET /templates`).
- Files: `files.merge` (`POST /tools/merge`).

Successful JSON responses are raw Intelliprint JSON under AppCall `data`. File fields accept `{url}` or `{content, name}` JSON objects (official JSON-or-multipart contract). `prints.delete` treats HTTP 200 and 202 as success. Official Connection/docs specify Bearer; native follows that. The upstream user-agent is not sent. No inbound webhook ops (Composio triggers = 0).

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://www.intelliprint.net/reference. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
