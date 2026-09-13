# BotStar

Read-only **BotStar Public API v1** recipe at `https://apis.botstar.com/v1`. This is the managed BotStar Cloud edition, not a caller-supplied host.

## Setup

Generate an API token on the BotStar account profile page (`https://app.botstar.com/account/profile`). Store it as `apiKey`. Requests send `Authorization: Bearer`, `Accept: application/json`, and `Content-Type: application/json` (pinned source sends Content-Type on GET as well).

## Operations

- `healthcheck`: `GET /bots/` with empty input (pinned credential probe; trailing slash).
- `bots.list`: `GET /bots/`.
- `bots.get`: `GET /bots/{botId}`.
- `bot-attributes.list`: `GET /bots/{botId}/attributes` with optional `env` (`draft` or `live`).
- `cms-entities.list`: `GET /bots/{botId}/cms_entities` with optional `env` (`draft` or `live`).

Successful responses are raw provider JSON under AppCall `data`. Bot, attribute, user, and CMS writes are omitted.

## Adaptations

Official REST OpenAPI is not published as a standalone reference; token minting is documented on the BotStar account profile, and `GET /v1/bots` is corroborated by Pipedream and Quickwork. This recipe follows pinned paths, including the trailing slash on `GET /bots/`. Native GETs omit the upstream user-agent. Native category is `messaging` (source Communication/Marketing are not in Rust CATEGORIES).

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
