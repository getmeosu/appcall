# Loyverse

International **Loyverse API v1.0** recipe covering Composio's 58 Loyverse tools. Create a personal access token in Loyverse Back Office integrations and store it as `apiKey`. Requests send `Authorization: Bearer <token>` and `Accept: application/json` to `https://api.loyverse.com/v1.0`.

OpenID discovery and JWKS use `https://api.loyverse.com/.well-known/...` (same allowed host, operation-level baseUrl).

OAuth authorization-code tokens are a separate third-party app edition and are omitted from setup.

## Operations

Origin/main kept:

- `healthcheck`: `GET /merchant/` (maps to `LOYVERSE_GET_MERCHANT_INFO`)
- `stores.list` / `stores.get`
- `items.list` / `items.get`

Added from the official OpenAPI (`API-Reference__v1.0.yaml`) to cover remaining Composio tools: categories, customers, discounts, employees, inventory, modifiers, payment types, POS devices, receipts (create + refund), shifts, suppliers, taxes, variants, webhook CRUD, item image upload/delete, and OpenID/JWKS.

Create-or-update tools are a single POST that updates when `id` / `variant_id` is present.

## Adaptations

- Pinned source uses `GET /merchant/` with a trailing slash; native keeps that path.
- Native category is `ecommerce`.
- HTTP 200 bodies with a populated `errors` array are demoted via `http.errors.bodyErrorPaths`.
- Item image upload is raw bytes with `Content-Type: application/octet-stream` (declarative `bodyEncoding: raw` cannot send `image/png`).
- Empty EventOnly inbound webhooks are not declared; Composio has 0 triggers. Webhook tools are HTTP CRUD on `/webhooks/`.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Request shapes follow [Loyverse API v1.0](https://developer.loyverse.com/docs). Fixtures are independently derived and are fixture-only; live smoke is unverified.
