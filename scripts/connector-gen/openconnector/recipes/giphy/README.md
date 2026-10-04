# GIPHY

GIPHY API v1 recipe for the public international API at `api.giphy.com`. Configure an API key from the GIPHY Developer Dashboard; the runner sends `api_key` as a query parameter.

Covered HTTP operations: credential-only `healthcheck` (`GET /v1/gifs/trending?limit=1`), GIF trending/search/get/translate/random/list-by-id, sticker search/trending/translate/random, categories, autocomplete tags, channel search, related tags, trending search terms, and random id. GIPHY does not expose customer EventOnly webhooks on this API. Upload lives on `upload.giphy.com` and is omitted to keep the network allowlist on `api.giphy.com`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://developers.giphy.com/docs/api/. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified.
