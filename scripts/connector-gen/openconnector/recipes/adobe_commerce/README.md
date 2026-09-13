# Adobe Commerce

**HOLD.** Official Adobe Commerce / Magento REST is served from a merchant-owned store host. Pinned OpenConnector requires a caller-supplied HTTPS `baseUrl` (placeholder `https://shop.example.com`). Adobe Commerce Cloud, `*.magento.cloud`, and custom domains are first-class hosts, so an Algolia/Grafana stored-id + bounded-wildcard pattern does not apply. This recipe is not admitted.

Documented operations (not admitted) would send `Authorization: Bearer` to `/rest/V1`:

- `healthcheck` / `products.list`: `GET /rest/V1/products`
- `products.get`: `GET /rest/V1/products/{sku}`
- `categories.list`: `GET /rest/V1/categories`
- `categories.get`: `GET /rest/V1/categories/{categoryId}`

Writes, nested searchCriteria filter groups, and optional store-view path segments are omitted. Native category is `ecommerce` (source Productivity/Marketing). `shop.example.com` in fixtures is the pinned definition placeholder, not a Commerce Cloud product host.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://developer.adobe.com/commerce/webapi/get-started/authentication/. Fixtures are independently derived and do not represent live provider access.
