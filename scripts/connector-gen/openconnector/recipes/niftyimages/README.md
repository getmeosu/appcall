# NiftyImages

NiftyImages v1 REST recipe for NiftyImages LLC (Rancho Cordova, California, United States) at version 0.2.0. Configure an API key from Settings > My API Keys. The runner sends the documented `ApiKey` header plus `Accept: application/json` to `https://api.niftyimages.com/v1`. The separate v2 Bearer API at `dev.niftyimages.com` is a different edition and is not this recipe.

`healthcheck` remains `GET /Widgets`. HTTP actions cover widgets, images, maps, the data store, and timer updates. NiftyImages does not publish vendor webhooks for this v1 edition.

Adaptations versus the pinned OpenConnector source: native returns raw JSON under `data`; native category is `email-marketing`; the upstream user-agent is not sent.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://api.niftyimages.com/images. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
