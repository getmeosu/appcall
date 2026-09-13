# Stormboard

Read-only international Stormboard REST API v1 recipe. Copy the API key from the API tab of a Stormboard account (`https://www.stormboard.com/users/account#api`). The runner sends `X-API-Key` and `Accept: application/json` to `https://api.stormboard.com`.

## Operations

- `healthcheck`: `GET /users/profile` with empty input (pinned credential validator).
- `storms.list`: `GET /storms/list` with optional `team`, `folder`, `needle`, `status`, `start`, `order`, and `results` (1–100).
- `storms.get`: `GET /storms/{stormId}`.
- `templates.categories.list`: `GET /templates/categories`.
- `templates.list`: `GET /templates`.

Idea/user/connector/tag lists, writes, OAuth, and optional `/templates/{category}` path switching are omitted. Native returns raw Stormboard JSON under `data`.

## Adaptations

Pinned source and official auth docs agree on `https://api.stormboard.com` and `X-API-Key`. Official auth examples also demonstrate `GET /users`; healthcheck stays on pinned `/users/profile`. Optional category path switching is omitted because native templates cannot express an optional path prefix. Native category is `productivity`. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://api.stormboard.com/docs and https://api.stormboard.com/docs/auth. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
