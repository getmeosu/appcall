# Anrok

Read-only international **Anrok Seller API** recipe for `api.anrok.com`. Create an API key at https://app.anrok.com/-/api-keys and store it as `apiKey`. Requests send `Authorization: Bearer`, `Accept: application/json`, and `Content-Type: application/json`. All covered operations are HTTP POST with a JSON body, matching official docs.

## Operations

- `healthcheck`: `POST /v1/seller/productTaxCategories/list` with `{}` (cheap authenticated catalog read; same path as the pinned credential validator).
- `productTaxCategories.list`: same path with `{}`.
- `customers.list`: `POST /v1/seller/customers/list` with optional JSON `cursor` and `limit` (1–100).
- `customers.get`: `POST /v1/seller/customers/id:{customerId}/get` with `{}`; `customerId` is required and URL-encoded.
- `products.get`: `POST /v1/seller/products/externalId:{externalId}/get` with `{}`; `externalId` is required and URL-encoded.

Transaction create/ephemeral, certificate-file uploads, and list endpoints that reject combined `cursor`+`filter` in the pinned executor are omitted. Successful responses are raw provider JSON under AppCall `data`.

## Adaptations

Pinned source and official docs agree on `https://api.anrok.com`, Bearer auth, and POST-JSON. Native category is `accounting` (source Finance / Data is not in the Rust CATEGORIES allowlist). Native omits the upstream user-agent. Empty POST bodies are `{}` as documented.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified. Configure the API key, call `healthcheck` with `{}`, then `customers.list`.
