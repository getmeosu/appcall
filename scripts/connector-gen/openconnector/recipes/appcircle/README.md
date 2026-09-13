# Appcircle

**HOLD.** Official Appcircle cloud API exchanges an organization API key name+secret for a Bearer access token via `POST application/x-www-form-urlencoded` to `https://auth.appcircle.io/auth/v1/api-key/token`, then calls `https://api.appcircle.io`. Native templates are a single HTTP request and cannot express that hop. Self-hosted Appcircle is a separate edition. This recipe is not admitted.

Documented operations (not admitted) would send `Authorization: Bearer {access_token}` after the token exchange:

- `healthcheck` / `organizations.list`: `GET /identity/v1/organizations`
- `build-profiles.list`: `GET /build/v2/profiles`
- `distribution-profiles.list`: `GET /distribution/v2/profiles`

Enterprise store profiles and writes are omitted. Native category is `dev-tools` (source Developer Tools).

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://docs.appcircle.io/account/my-organization/security/api-keys. Fixtures are independently derived and do not represent live provider access.
