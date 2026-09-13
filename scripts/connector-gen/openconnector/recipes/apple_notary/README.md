# Apple Notary

**HOLD.** Official international Apple Notary API v2 at `https://appstoreconnect.apple.com/notary/v2`. Create an App Store Connect API key and download the .p8 file once. Every request needs an ES256 JWT (`kid`, optional `iss` for a team key, `aud` = `appstoreconnect-v1`).

Pinned OpenConnector signs that JWT in `src/providers/app_store_connect/jwt.ts` (`createAppStoreConnectAuthorization`). Native cannot sign JWTs (`credentials` / `operationQuality` unproven). Selection is HOLD.

Covered operations (not admitted): `healthcheck` → `GET /notary/v2/submissions`; `submissions.get` → `GET /notary/v2/submissions/{submissionId}`; `submissions.log` → `GET /notary/v2/submissions/{submissionId}/logs`. `submit_software` (write + temporary S3 upload credentials) is omitted. Native category is `dev-tools` (source Developer Tools / Security; Security is not in the Rust CATEGORIES allowlist). The stand-in Bearer `privateKey` header is not the Notary wire.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://developer.apple.com/documentation/notaryapi/submitting-software-for-notarization-over-the-web. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
