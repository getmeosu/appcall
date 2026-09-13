# Heartbeat

Read-only international **Heartbeat community API** recipe. Create an API key from Settings > System > API Keys. Store it as `apiKey`. The runner sends `Authorization: Bearer` and `Accept: application/json` to `https://api.heartbeat.chat/v0`.

## Operations

- `healthcheck`: `GET /channels` with empty input (cheap authenticated channel list; pinned credential validator).
- `users.list`: `GET /users`.
- `users.get`: `GET /users/{userId}`; `userId` is a required non-empty string.
- `groups.list`: `GET /groups`.
- `events.list`: `GET /events` with optional `groupId` sent as official query `groupID`.

Successful responses are raw provider JSON under AppCall `data`. User/group/channel/event writes, email lookup, and webhooks are omitted.

## Adaptations

Official docs use `Authorization: Bearer <API_KEY>` on `https://api.heartbeat.chat/v0`. Native category is `social` (community platform; source Communication is not in native CATEGORIES). The upstream user-agent is not sent. Responses keep raw Heartbeat JSON under `data` instead of the source users/groups/channels/events unwrap.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://heartbeat.readme.io/reference/authorization and https://help.heartbeat.chat/hc/en-us/articles/33257714954001-Heartbeat-API. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
