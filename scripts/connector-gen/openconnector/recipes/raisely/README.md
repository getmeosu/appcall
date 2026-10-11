# Raisely

International **Raisely REST API v3** recipe covering the Composio RAISELY toolkit plus the origin healthcheck.

## Setup

Create a campaign secret key in Raisely admin under Settings → API & Webhooks. Store it as `apiKey`. Requests send `Authorization: Bearer <key>` and `Accept: application/json` to `https://api.raisely.com/v3`.

## Operations

Recipe operations equal runner operations. Reads, writes, and deletes map 1:1 onto official Raisely REST routes (campaigns, profiles, donations, users, posts, webhooks, exercise logs, interactions, subscriptions, orders, promo codes, tags, segments, media). `healthcheck` remains `GET /campaigns?limit=1`. `events.available` reads `GET /api-docs` because Raisely has no dedicated webhook-event catalog route. `campaigns.media.upload` is a handwritten multipart handler.

Successful responses are raw provider JSON under AppCall `data`.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
