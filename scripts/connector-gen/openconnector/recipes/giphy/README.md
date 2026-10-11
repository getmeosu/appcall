# GIPHY

International GIPHY API recipe. Configure an API key from https://developers.giphy.com/dashboard/. The runner sends it as the documented `api_key` query parameter.

Covered operations: credential-only `healthcheck` (`GET /v1/gifs/trending?limit=1`), GIF trending/search/get/list-by-id/translate/random/upload, sticker search/trending/translate/random, categories list/get/tagged GIFs, emoji list/variations, tag autocomplete/related/random, trending search terms, channel search, random id, and analytics action register.

Network allowlist: `api.giphy.com`, `upload.giphy.com`, and `giphy-analytics.giphy.com`. Emoji uses per-operation `https://api.giphy.com/v2`. Upload is URL-based form POST (`source_image_url`); multipart local-file upload is omitted. Analytics register is GET `/v2/pingback_simple` on the analytics host.

Adaptations versus the pinned OpenConnector source: responses are raw GIPHY JSON under `data` (except analytics `{ok: true}`); optional rating/bundle/country filters are optional query fields; the upstream user-agent is not sent.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://developers.giphy.com/docs/api/. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
