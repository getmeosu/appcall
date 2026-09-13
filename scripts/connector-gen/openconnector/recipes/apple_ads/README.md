# Apple Ads

**HOLD.** Official international Apple Ads Platform API at `https://api.ads.apple.com`. Apple Ads Account Settings → API issues `clientId`, `teamId`, and `keyId` after you upload an EC P-256 public key. The matching private key is used only to sign a short-lived ES256 JWT `client_secret`.

Pinned OpenConnector then `POST https://appleid.apple.com/auth/oauth2/token` with `grant_type=client_credentials` and `scope=searchadsorg`, and sends `Authorization: Bearer` plus optional `X-AP-Context: adAccountId=` to the Platform API. Native cannot sign that JWT or express the OAuth token exchange (`credentials` / `operationQuality` unproven). Selection is HOLD.

Covered operations (not admitted): `healthcheck` → `GET /v1/me`; `acls.list` → `GET /v1/acls`. Campaign, ad-group, keyword, report, and write actions omitted. Native category is `ads` (source Marketing/Data; Marketing is not in the Rust CATEGORIES allowlist). The stand-in Bearer `privateKey` header is not the Apple Ads wire.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://developer.apple.com/documentation/apple-ads-platform-api/implementing-oauth-for-the-apple-ads-platform-api. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
