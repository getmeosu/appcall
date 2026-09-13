# Gift Up

Read-only Gift Up API recipe. Configure the dashboard API key. The runner sends `Authorization: Bearer <apiKey>` and `Accept: application/json` to `https://api.giftup.app`.

Selected operations are `healthcheck` and `company.get` (`GET /company`), `gift-cards.list` (`GET /gift-cards` with optional `limit` and `offset`), `gift-cards.get` (`GET /gift-cards/{code}`), and `orders.list` (`GET /orders`). Redeem, void, top-up, and other mutations are omitted. `code` is a required non-empty string and is URL-encoded as a path segment.

Adaptations versus the pinned OpenConnector source: the native key is `gift-up` while the upstream directory is `gift_up`; the upstream user-agent is not sent; responses keep raw provider JSON under `data` instead of the source normalized company/giftCard wrappers.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://developer.giftup.com/api. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure the API key, call `healthcheck` with `{}`, then `gift-cards.list`.
