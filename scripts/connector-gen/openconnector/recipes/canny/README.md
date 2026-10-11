# Canny

International **Canny REST API v1/v2** recipe covering origin healthcheck plus every Composio `CANNY_*` HTTP tool (25 tools, 27 operations; healthcheck is an authenticated `POST /v1/boards/list` probe and is not a Composio slug; `posts.get` is kept from origin and is not a Composio slug).

Create a secret API key in Canny company settings and store it as `apiKey`. Requests `POST` JSON with `apiKey` in the body and `Content-Type: application/json` to `https://canny.io/api`.

## Operations

- Auth: `healthcheck` (`POST /v1/boards/list`).
- Boards: `boards.list`, `boards.get`.
- Posts: `posts.list`, `posts.get`, `posts.create`, `posts.update`, `posts.delete`, `posts.add_tag`, `posts.change_status`.
- Comments: `comments.list`, `comments.create`, `comments.delete`.
- Users: `users.list`, `users.get`, `users.create_or_update`, `users.delete`.
- Votes: `votes.list`, `votes.create`, `votes.delete`.
- Tags: `tags.list`, `tags.get`, `tags.create`.
- Categories: `categories.list`.
- Companies: `companies.list`.
- Opportunities: `opportunities.list`.
- Changelog: `entries.create`.

Origin list/get operations keep their curated result mappings (`boards`, `board`, `posts`/`hasMore`, `post`). New operations return raw Canny JSON under AppCall `data`, except endpoints that respond with the literal `success` string (`votes.create`, `posts.update`, deletes), which map to `{success: true}`. `votes.list` maps Composio `voterID` to official `userID`. Optional body fields are omitted when unset. The upstream user-agent is not sent.

Research HOLD from 2026-09-13 is unchanged: 21bitcoin disclosed a 2026-08-28 Canny incident; Canny public RCA was not found at review time.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://developers.canny.io/api-reference. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
