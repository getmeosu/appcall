# ImageKit

International **ImageKit Digital Asset Management API** recipe (v0.2.0). Reveal the private API key under Developer options > API keys. Store it as `apiKey`. The runner sends HTTP Basic authentication with the private key as username and an empty password to `https://api.imagekit.io`, plus `Accept: application/json`.

## Operations

- `healthcheck`: `GET /v1/files?limit=1`.
- Files: `assets.list`, `files.get`, `files.metadata.get`, `files.update`, `files.delete`, `files.copy`, `files.move`, `files.rename`, `files.bulk.delete`, `files.tags.add`.
- Folders: `folders.create|delete|copy|move|rename`.
- Cache: `cache.purge`, `cache.purge.get`.
- `metadata.from_url`, `custom_metadata_fields.list`, `usage.get`.
- EventOnly webhooks: `webhook.video_transformation_ready`, `webhook.upload_complete`.

Successful responses are raw provider JSON under AppCall `data`.

## Adaptations

Official curl uses `-u your_private_api_key:`. Native Basic uses `http.auth.basic` with the private key as username and an empty password, matching pinned `Buffer.from(\`${apiKey}:\`)`. Native category is `dev-tools` (source Design & Media/Storage are not in native CATEGORIES). The upstream user-agent is not sent. Pinned `fileType` values `all|image|non-image` are retained from source; current docs also describe a `type` query and Lucene `searchQuery` on the same list endpoint.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://imagekit.io/docs/api-keys and https://imagekit.io/docs/api-reference/digital-asset-management-dam/list-and-search-assets. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
