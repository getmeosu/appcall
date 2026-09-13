# Ghost

Read-only international **Ghost(Pro) Content API** recipe. Create a Custom Integration in Ghost Admin and store the Content API key as `apiKey` plus the Ghost(Pro) admin subdomain as `siteSlug` (the `{slug}` in `{slug}.ghost.io`). Requests send `key` as a query parameter and `Accept-Version: v6.0` to `https://<siteSlug>.ghost.io/ghost/api/content`. Self-hosted Ghost and caller-supplied publication URLs are not admitted.

## Operations

- `healthcheck`: `GET /settings/` (cheap authenticated public settings read).
- `posts.list`: `GET /posts/` with optional `limit` (1–100) and `page` (>=1).
- `posts.get`: `GET /posts/{id}/`; `id` is required.
- `tags.list`: `GET /tags/` with optional `limit` and `page`.
- `authors.list`: `GET /authors/` with optional `limit` and `page`.

Successful responses are raw Ghost JSON under AppCall `data`. Admin API JWT signing, writes, and slug lookups are omitted.

## Adaptations

Pinned source accepted any `siteUrl` and placed `v5.0` in the path. Native pins Ghost(Pro) `*.ghost.io` admin hosts and uses official `/ghost/api/content/` plus `Accept-Version: v6.0`. Native category is `productivity` (source Marketing is not in the Rust CATEGORIES allowlist). CVE-2026-26980 is a historical self-hosted Content API SQLi patched in 6.19.1.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://docs.ghost.org/content-api. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
