# Ghost

International **Ghost(Pro)** Content API recipe. Admin domain is `{siteSlug}.ghost.io`. Self-hosted Ghost is not admitted.

## Setup

Store the Content API key as `apiKey` and the Ghost(Pro) admin subdomain as `siteSlug`. Requests send `key` as a query parameter to `https://{siteSlug}.ghost.io/ghost/api/content` with `Accept-Version: v6.0`. Hosts are bounded to `*.ghost.io`.

## Operations

HTTP actions cover Content API posts, pages, tags, authors, tiers, and settings (read-only; Admin API JWT signing is not admitted). EventOnly webhooks map Ghost Admin events such as `post.published` and `member.added`.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
