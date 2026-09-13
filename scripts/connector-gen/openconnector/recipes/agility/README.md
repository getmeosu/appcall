# Agility CMS

Read-only international Agility CMS Content Fetch API recipe on the pinned US host `api.aglty.io`. Configure a Fetch or Preview API key from Settings → API Keys. Each operation also needs the instance GUID and `apiType` (`fetch` or `preview`). Locale, list reference names, content/page IDs, and channel names are per-request inputs.

## Operations

- `healthcheck`: `GET /{guid}/{apiType}/contentmodels`
- `content.list`: `GET /{guid}/{apiType}/{locale}/list/{referenceName}` with optional `take` (`Take`, 1–250), `skip` (`Skip`), and `fields` (`Fields`)
- `content.get`: `GET /{guid}/{apiType}/{locale}/item/{id}` with optional `contentLinkDepth` and `expandAllContentLinks`
- `pages.get`: `GET /{guid}/{apiType}/{locale}/page/{id}` with the same optional link-expansion query
- `sitemap.flat`: `GET /{guid}/{apiType}/{locale}/sitemap/flat/{channelName}`

Nested sitemap, content sync, and Content Management API writes are omitted. Auth is the `APIKey` header. Official regional hosts (`api-ca.aglty.io`, `api-eu.aglty.io`, `api-aus.aglty.io`) are documented but not admitted; this recipe follows the pinned US host only.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://agilitycms.com/docs/developers/content-fetch-api. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
