# WP Maps

Read-only international WP Maps SaaS API v1 recipe. Generate an access token under Super Admin > Configuration > Access Token and copy the Client ID. The runner sends `access_token` and `client_id` as query parameters plus `Accept: application/json` to `https://svr.wpmaps.net/v1`.

## Operations

- `healthcheck`: `GET /products/all` with empty input (pinned credential validator).
- `products.list`: `GET /products/all` with optional `language` (`lang`).
- `products.get`: `GET /products/get/{productId}` with optional `language`.
- `stores.list`: `GET /stores/all` with optional `language`.
- `stores.get`: `GET /stores/get/{storeId}` with optional `language`.

Product/store creates, updates, and deletes are omitted. Native returns raw JSON under `data`. Native category is `ecommerce` (source Location/Marketing/Data are not in the Rust CATEGORIES allowlist; WP Maps is a product/store locator for brands).

## Adaptations

The API guide intro example URL shows POST for get-product; native follows the documented Get Product / Get All Products GET methods, matching pinned source. Distinct from Flippercode's WP Maps / WP Maps Pro WordPress plugins. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://wpmaps.com/help/wp-maps-api-your-guide-to-integration-and-functionality/. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure access token and client ID, call `healthcheck` with `{}`, then `stores.list` with `{}`.
