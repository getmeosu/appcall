# Precoro

Read-only Precoro REST API recipe. Configure three setup fields: `X-AUTH-TOKEN` (secret), the Precoro user email sent as the `email` header, and API region `com` or `us`. Region is a required stored field: `com` targets `https://api.precoro.com` and `us` targets `https://api.precoro.us`. Allowed hosts are exactly those two names. Generate the token under Configuration → Integrations → API Key (`https://app.precoro.com/manage/user/apitokens` or the `.us` equivalent).

Selected operations are `healthcheck` and `users.list` (`GET /users`), `warehouses.list` (`GET /warehouses`), `suppliers.list` (`GET /suppliers` with optional `page` and `per_page` 10/20/50/100/200), and `purchase_orders.list` (`GET /purchaseorders` with the same pagination). Document create/approve, `page=last`, `modifiedSince`, and repeated `status[]` / `external_id[]` filters are omitted.

Adaptations versus the pinned OpenConnector source: native templates send `X-AUTH-TOKEN` and `email` without the upstream user-agent; region is a required stored setup field interpolated into `https://api.precoro.{{region}}` instead of defaulting a blank optional region to `com`; integer pages only; raw list JSON is returned under `data`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://help.precoro.com/using-api-in-precoro and https://help.precoro.com/us-based-server-1. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure token, email, and region, call `healthcheck` with `{}`, then `users.list`.
