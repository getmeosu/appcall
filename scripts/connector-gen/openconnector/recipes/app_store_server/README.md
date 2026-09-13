# App Store Server API

**HOLD.** Official App Store Server API authorizes every call with an ES256 JWT signed from an In-App Purchase PKCS#8 `.p8` key (`alg=ES256`, `aud=appstoreconnect-v1`, `bid`). Pinned OpenConnector uses `jose` `SignJWT` and decodes JWS transaction payloads. Native templates have no signing primitive. This recipe is not admitted.

Documented operations (not admitted) would send `Authorization: Bearer <signed JWT>` to `https://api.storekit.apple.com`:

- `healthcheck`: `GET /inApps/v1/transactions/0` (pinned validator)
- `transactions.get`: `GET /inApps/v1/transactions/{transactionId}`
- `subscriptions.list`: `GET /inApps/v1/subscriptions/{transactionId}`

Sandbox host `api.storekit-sandbox.apple.com`, JWS response decoding, refunds, notifications, and retention messaging are omitted. Native category is `payments` (source Developer Tools/Finance).

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://developer.apple.com/documentation/appstoreserverapi/generating-json-web-tokens-for-api-requests. Fixtures are independently derived and do not represent live provider access.
