# Discourse

**HOLD.** Discourse is open-source forum software. Official docs and the pinned OpenConnector connector require a caller-supplied HTTPS forum URL (`Api-Key` + `Api-Username`). Discourse.org hosting uses `*.discourse.group` and first-class custom domains; self-hosted Site URLs are the primary model. No Algolia/Grafana stored-id + bounded-wildcard host covers the official product, so this recipe is not admitted.

Documented operations (not admitted) would send `Api-Key` and `Api-Username`:

- `healthcheck` / `topics.latest.list`: `GET /latest.json`
- `categories.list`: `GET /categories.json`
- `topics.get`: `GET /t/{topicId}.json`

Writes, search, and category-topic listing are omitted. Native category is `messaging`. `meta.discourse.org` in fixtures is the docs example forum, not a product-wide cloud host.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://docs.discourse.org/ and https://meta.discourse.org/t/create-and-configure-an-api-key/230124. Fixtures are independently derived and do not represent live provider access.
