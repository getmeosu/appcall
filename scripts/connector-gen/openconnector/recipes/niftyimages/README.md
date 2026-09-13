# NiftyImages

Read-only NiftyImages v1 REST recipe for NiftyImages LLC (Rancho Cordova, California, United States). Configure an API key from Settings > My API Keys. The runner sends the documented `ApiKey` header plus `Accept: application/json` to `https://api.niftyimages.com/v1`. The separate v2 Bearer API at `dev.niftyimages.com` is a different edition and is not this recipe.

Selected operations are `healthcheck` (`GET /Widgets`), `images.list` (`GET /Images` with optional `pageSize` and `pageNumber`), `image.get` (`GET /Image?url=`), `images.stats` (`GET /Images/AllStats` with optional ISO 8601 `startDate`/`endDate`), and `widgets.stats` (`GET /Widgets/AllStats` with the same optional date range). Healthcheck uses the documented widget list rather than image search. Widget-user path reads are omitted.

Adaptations versus the pinned OpenConnector source: native returns raw JSON under `data`; native category is `email-marketing` (source Design & Media/Marketing are not in native CATEGORIES); the upstream user-agent is not sent.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://api.niftyimages.com/images. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure an API key, call `healthcheck` with `{}`, then `images.list`.
