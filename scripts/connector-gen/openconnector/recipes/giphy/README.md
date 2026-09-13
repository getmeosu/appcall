# GIPHY

Read-only international GIPHY API v1 recipe. Configure an API key from https://developers.giphy.com/dashboard/. The runner sends it as the documented `api_key` query parameter to `https://api.giphy.com/v1` with `Accept: application/json`. Beta keys are rate-limited (100 calls/hour); production keys are a paid upgrade.

Covered operations: credential-only `healthcheck` (`GET /v1/gifs/trending?limit=1`, matching pinned credential validation), `gifs.trending`, `gifs.search`, `gifs.get`, and `categories.list`. Stickers, translate, random, upload, and related-tag fanout are omitted.

Adaptations versus the pinned OpenConnector source: responses are raw GIPHY JSON under `data` rather than `{gifs, pagination}` / unwrapped GIF objects; optional rating/bundle/country context filters are omitted; the upstream user-agent is not sent.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://developers.giphy.com/docs/api/. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure the API key, call `healthcheck` with `{}`, then `gifs.search` with a query.
