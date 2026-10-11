# Gift Up

International **Gift Up REST API** recipe covering the origin healthcheck plus every Composio `GIFT_UP_*` HTTP tool (44 tools, 46 operations including origin `healthcheck` and `orders.list`).

## Setup

Create an API key from the Gift Up dashboard under Integrations → API keys. Store it as `apiKey`. Requests send `Authorization: Bearer <key>` and `Accept: application/json` to `https://api.giftup.app`.

## Operations

- Origin reads: `healthcheck` and `company.get` (`GET /company`), `gift-cards.list` / `gift-cards.get`, `orders.list`.
- Gift cards: redeem, redeem-in-full, top-up, void, reactivate, undo-redemption, JSON Patch update.
- Catalog: items and item groups (create/list/get/update/delete).
- Orders: create, get, JSON Patch update, add note.
- Settings: checkout, email, gift-card, shipping, artwork list/upload.
- Reports, locations, promotions, users, webhooks, Stripe connection, GET/POST `/ping`.

JSON Patch updates send `Content-Type: application/json-patch+json` with an RFC 6902 operations array. Composio artwork `Url` maps to official `url`. DELETE and some empty 200 writes return `{success: true}`. Optional `test_mode` / `x_giftup_testmode` set `x-giftup-testmode`. Successful JSON responses are raw provider JSON under AppCall `data`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://developer.giftup.com/api. Live authentication is unverified.
