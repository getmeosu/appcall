# Agility CMS

International Agility CMS recipe covering the Content Fetch API on `api.aglty.io` and Management API writes on `mgmt.aglty.io`. Store a Fetch or Preview API key for read operations. Management writes send `Authorization: Bearer` using the same `apiKey` field (use a Personal Access Token for those calls). Each Fetch operation also needs the instance GUID and `apiType` (`fetch` or `preview`).

## Operations

- `healthcheck`: `GET /{guid}/{apiType}/contentmodels`
- `content.list` / `content.get`: Fetch list and item reads
- `pages.get` / `pages.getByPath`: Fetch page by ID or channel path
- `sitemap.flat` / `sitemap.nested`: Fetch sitemaps
- `galleries.get`: Fetch gallery by ID
- `sync.items` / `sync.pages`: Fetch sync pages
- `urlredirections.list`: Fetch URL redirections
- `content.save` / `content.publish` / `content.unpublish` / `content.delete`: Management content writes
- `pages.publish` / `pages.delete`: Management page writes
- `containers.list` / `assets.list` / `locales.list`: Management reads
- EventOnly webhooks: `webhook.content.published`, `webhook.content.saved`, `webhook.content.deleted`, `webhook.page.published`, `webhook.content.approved`

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://agilitycms.com/docs/developers/content-fetch-api, https://agilitycms.com/docs/developers/content-management-api, https://agilitycms.com/docs/developers/webhooks. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
