# Raindrop.io

International **Raindrop.io REST API v1** recipe. Raindrop.io is a global bookmark manager operated by Rustem Mussabekov.

## Setup

Register an integration at https://app.raindrop.io/settings/integrations and copy the **Test token** (own-account) or an OAuth access token. Store it as `apiKey`. Requests send `Authorization: Bearer <token>` and `Accept: application/json` to `https://api.raindrop.io/rest/v1`.

## Operations

HTTP actions cover collections, raindrops, tags, highlights, filters, import helpers, and the authenticated user. Raindrop.io does not publish HTTP webhooks.

Successful responses are raw provider JSON under AppCall `data`. Nested optional objects such as `parent.$id` are omitted so unresolved templates do not render as `{}`.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
