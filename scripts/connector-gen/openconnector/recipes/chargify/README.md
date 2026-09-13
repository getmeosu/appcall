# Maxio Advanced Billing

**HOLD.** Official Maxio Advanced Billing (formerly Chargify) REST is served from a merchant site host. Pinned OpenConnector requires a caller-supplied HTTPS `siteUrl` and accepts both `{subdomain}.chargify.com` and `{subdomain}.ebilling.maxio.com`. Official docs also document a US production template `https://{site}.chargify.com` plus EU hosting. A single Algolia/Grafana stored-id + bounded-wildcard host cannot cover those official parent domains. This recipe is not admitted.

Documented operations (not admitted) would send HTTP Basic `apiKey:x` to the site root:

- `healthcheck` / `customers.list`: `GET /customers.json`
- `customers.get`: `GET /customers/{customerId}.json`
- `products.list`: `GET /products.json`
- `subscriptions.list`: `GET /subscriptions.json`

The pinned credential validator uses `GET /site.json`, which is not an extracted upstream action, so native healthcheck would map to `list_customers`. Writes are omitted. Native category is `payments` (source Finance). `acme.chargify.com` in fixtures is the pinned definition placeholder, not a stored site id.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://developers.maxio.com/http/getting-started/how-to-get-started and https://docs.maxio.com/hc/en-us/articles/24294819360525-Advanced-Billing-API-Keys. Fixtures are independently derived and do not represent live provider access.
