# Zylvie

Read-only international **Zylvie REST API** recipe. Copy an API key from https://developers.zylvie.com/settings/api and store it as `apiKey`. Requests send `Authorization: Bearer <key>` and `Accept: application/json` to `https://api.zylvie.com`.

## Operations

- `healthcheck`: `GET /me` with empty input (cheap authenticated account probe; pinned credential validator and Pipedream connect probe).
- `current_user.get`: same `GET /me`.
- `coupons.list`: `GET /coupons/list` with optional `archived`.
- `license.keys.verify`: `GET /licensekeys/verify`; required `productId` and `licenseKey` bind to `product_id` and `license_key`.
- `subscriptions.verify`: `GET /subscriptions/verify`; required `email`.

Successful responses are raw provider JSON under AppCall `data`. Product/coupon writes and license redeem/refund POSTs are omitted.

## Adaptations

Pinned source and public webhook docs agree on `https://api.zylvie.com` and `Authorization: Bearer`. The API key settings page is login-gated; Bearer placement is confirmed by public webhook examples and Pipedream `GET https://api.zylvie.com/me`. Native category is `ecommerce` (source Marketing/Finance are not in the Rust CATEGORIES allowlist). Native returns raw JSON under `data`; `subscriptions.verify` returns the raw array (pinned source wraps it as `{subscriptions}`). The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
