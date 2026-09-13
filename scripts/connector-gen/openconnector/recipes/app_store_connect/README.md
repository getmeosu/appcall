# App Store Connect

**HOLD.** Apple's App Store Connect API requires an ES256 JWT signed from a PKCS#8 P-256 `.p8` private key, key ID, and (for team keys) issuer ID. Tokens must use `aud: appstoreconnect-v1` and `exp - iat` of at most 20 minutes. The pinned OpenConnector connector signs with `jose` `SignJWT` in `jwt.ts`. Native templates can only place a static header or query secret and cannot sign, so this recipe is not admitted.

Documented operations (not admitted) would target `api.appstoreconnect.apple.com`:

- `healthcheck`: `GET /v1/apps?limit=1` (pinned validator)
- `apps.list`: `GET /v1/apps`
- `apps.get`: `GET /v1/apps/{appId}`
- `users.list`: `GET /v1/users`

Native category is `dev-tools` (source Developer Tools / Productivity). A stored Bearer JWT would expire within 20 minutes and is not the official credential shape.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://developer.apple.com/documentation/appstoreconnectapi/generating-tokens-for-api-requests. Fixtures are independently derived and do not represent live provider access.
