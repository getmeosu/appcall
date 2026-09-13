# Instatus

Read-only Instatus API recipe for the international status-page product. Store an API key from User settings → Developer settings. Requests use `https://api.instatus.com` with `Authorization: Bearer` and `Accept: application/json`.

## Operations

- `healthcheck`: `GET /v2/pages` with empty input. Official `GET /v1/user` is documented for credential validation but is not an upstream action ID, so healthcheck uses the list-pages read.
- `pages.list`: `GET /v2/pages` with optional `page` and `perPage` (`per_page`).
- `components.list`: `GET /v2/{pageId}/components` from official Help. Pinned source `/v2/pages/{pageId}/components` independently 404s; OpenAPI `/v1/{pageId}/components` also exists as a live route but GET follows Help v2.
- `components.get`: `GET /v2/{pageId}/components/{componentId}` from official Help.
- `incidents.list`: `GET /v1/{pageId}/incidents` with optional pagination. Comma-joined `status` / `!status` filters are omitted.

Successful responses are preserved as raw provider JSON under AppCall `data`. List endpoints return JSON arrays. `secureLink` is not redacted.

## Testing and live smoke

Fixtures are supplied evidence only. They cover success, unauthorized 401, missing `pageId`, and an extra healthcheck field. Fixtures do not prove live credentials. For live smoke, use a least-privilege key, invoke `healthcheck`, then list pages, components, and incidents.

Upstream definitions/runtime are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector), pinned at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`.
