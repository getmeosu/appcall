# Stormboard

International Stormboard REST API v1 recipe covering the Composio STORMBOARD toolkit. Copy the API key from the API tab of a Stormboard account (`https://www.stormboard.com/users/account#api`). The runner sends `X-API-Key` and `Accept: application/json` to `https://api.stormboard.com`.

## Operations

Origin ops kept:

- `healthcheck`: `GET /users/profile` (also maps `STORMBOARD_GET_INFO_ABOUT_YOUR_USER`).
- `storms.list`: `GET /storms/list` (`STORMBOARD_GET_A_LIST_OF_YOUR_STORMS`).
- `storms.get`: `GET /storms/{stormId}` (`STORMBOARD_DETAILS`).
- `templates.categories.list`: `GET /templates/categories`.
- `templates.list`: `GET /templates`.

Added Composio tools as real HTTP operations for storms (create/close/reopen/duplicate/join/invite/favorite/access/template/legend/section/ideas/users/connectors/tags), ideas (create/get/connectors/tags), chat, and users (test/auth/create/verify/profile/notifications).

Native returns raw Stormboard JSON under `data`. Composio `storm_id` / `idea_id` / `connector_id` path fields are used on new ops; origin `storms.get` still requires `stormId`.

## Adaptations

Official docs at `https://api.stormboard.com/json` plus Composio STORMBOARD (41 tools). Auth is `X-API-Key`. `STORMBOARD_UPDATE_NOTIFICATIONS.email_notifications` is sent as `dailyemail`. `STORMBOARD_CREATE_A_NEW_STORM.teamId` is sent as `team_id`. `STORMBOARD_JOIN_A_STORM` sends `stormid`/`stormkey`. Legend color fields are nested under `color`. The upstream user-agent is not sent. No inbound webhook ops (Composio triggers = 0).

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://api.stormboard.com/docs and https://api.stormboard.com/docs/auth. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
