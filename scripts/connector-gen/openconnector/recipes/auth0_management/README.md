# Auth0 Management

**HOLD.** Official Auth0 Management API v2 is served from a caller-supplied tenant host. Pinned OpenConnector requires a tenant domain extra field (placeholder `example.us.auth0.com`) and accepts hostnames ending in `.auth0.com` or `.auth0app.com`. Official hosts also include `{tenant}.{region}.auth0.com` (us, eu, au, jp, uk, ca and sub-localities) and custom domains. An Algolia/Grafana stored-id + single bounded-wildcard pattern does not cover those official hosts. This recipe is not admitted.

Documented operations (not admitted) would send `Authorization: Bearer` to `/api/v2`:

- `healthcheck` / `users.list`: `GET /api/v2/users` (healthcheck uses `page=0&per_page=1`)
- `users.get`: `GET /api/v2/users/{userId}`
- `users.by-email`: `GET /api/v2/users-by-email?email=`
- `roles.list`: `GET /api/v2/roles`

Lucene `q` plus computed `search_engine=v3`, role/user mutations, and organization-level role filters are omitted. Native category is `dev-tools` (source Security is not in the Rust CATEGORIES allowlist). `example.us.auth0.com` in fixtures is the pinned definition placeholder, not a product-wide Auth0 host.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://auth0.com/docs/api/management/v2. Fixtures are independently derived and do not represent live provider access.
