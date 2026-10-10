# Dribbble

International **Dribbble API v2** recipe covering origin healthcheck plus every Composio `DRIBBBLE_*` HTTP tool (12 tools, 13 operations; healthcheck is an authenticated `GET /user` probe and is not a Composio slug).

Supply a user OAuth2 access token with `public` and `upload` scopes and store it as `accessToken`. Requests send `Authorization: Bearer <token>` to `https://api.dribbble.com/v2`. Composio-managed OAuth is not available.

## Operations

- Auth: `healthcheck`, `users.me` (`GET /user`).
- Shots: `shots.list`, `shots.get`, `shots.create`, `shots.update`, `shots.delete`.
- Projects: `projects.list`, `projects.create`, `projects.update`, `projects.delete`.
- Attachments: `attachments.create`, `attachments.delete`.

`shots.create` and `attachments.create` are handwritten multipart uploads because the declarative runner only encodes JSON or `application/x-www-form-urlencoded`. Create-shot is asynchronous (HTTP 202 + `Location`). Optional query and JSON body fields are omitted when unset. List endpoints return the raw `Link` header as `paginationLink`. Native category is `social`. No inbound webhook ops (Composio triggers = 0).

Source attribution: official Dribbble API v2. Open-connector pin referenced by AppCall recipes: `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://developer.dribbble.com/v2/. Composio: https://docs.composio.dev/toolkits/dribbble. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
