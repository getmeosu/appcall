# Goody

International **Goody production API** recipe at `https://api.ongoody.com`. This is production, not the sandbox host `api.sandbox.ongoody.com`.

Create an API key from a Goody for Business account and store it as `apiKey`. Requests send `Authorization: Bearer <token>` and `Accept: application/json`.

Version 0.2.0 covers products, orders, order batches, brands, cards, collections, payment methods, workspaces, and order activities, plus EventOnly Svix order/batch webhooks. HTTP `POST /v1/webhooks` management and commerce-user payment-method create are omitted.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache-2.0). Fixtures use `fixture-api-token` only. Live smoke is unverified.
