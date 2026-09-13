# Sender

International Sender API v2 recipe. Create an API access token in Sender **Account settings → API access tokens** and send it as `Authorization: Bearer <token>`.

Operations are bounded reads: `healthcheck` (`GET /groups?limit=1`), `groups.list`, `groups.get`, `subscribers.list`, and `campaigns.list`. Caller-controlled `page`, `limit`, and campaign `status` are never used to follow provider pagination links. Subscriber, group, field, and campaign writes are omitted.

Official help copy asks for `Content-Type: application/json` on GET; native GET reads omit `Content-Type` because the pinned executor only sets it when a body is present. HTTP 200 bodies with a non-empty `message` are treated as errors because native `bodyErrorPaths` cannot invert Sender's `success` boolean.

Pinned source: `oomol-lab/open-connector@33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache-2.0). Fixtures are supplied; live authentication is unverified.
