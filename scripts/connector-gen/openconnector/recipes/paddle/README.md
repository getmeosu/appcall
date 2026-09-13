# Paddle

Read-only international Paddle Billing live API recipe. Create an API key from Paddle > Developer Tools > Authentication. The runner sends `Authorization: Bearer` to `https://api.paddle.com`. Sandbox (`sandbox-api.paddle.com`) is not admitted.

Covered operations: credential-only `healthcheck` (`GET /products?per_page=1`), `products.list`, `products.get`, `prices.list`, and `customers.list`. Writes, Skip-Count, and comma-joined array filters are omitted.

Adaptations versus the pinned OpenConnector source: healthcheck uses the validator `GET /products?per_page=1` rather than official quickstart `GET /event-types`; native category is `payments` rather than Finance; responses are raw Paddle JSON under `data`; the upstream user-agent is not sent.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://developer.paddle.com/api-reference/about/authentication. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
