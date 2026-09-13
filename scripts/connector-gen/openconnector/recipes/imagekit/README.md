# ImageKit

Read-only international **ImageKit Digital Asset Management API** recipe. Reveal the private API key under Developer options > API keys. Store it as `apiKey`. The runner sends HTTP Basic authentication with the private key as username and an empty password to `https://api.imagekit.io`, plus `Accept: application/json`.

## Operations

- `healthcheck`: `GET /v1/files?limit=1` with empty input (cheap authenticated file list; pinned credential validator).
- `assets.list`: `GET /v1/files` with optional `path`, `searchQuery`, `fileType` (`all`|`image`|`non-image`), `sort`, `limit` (1–1000), and `skip` (≥0).
- `files.get`: `GET /v1/files/{fileId}/details`; `fileId` is a required non-empty string.
- `files.metadata.get`: `GET /v1/files/{fileId}/metadata`; `fileId` is a required non-empty string.

Successful responses are raw provider JSON under AppCall `data`. Delete, cache purge, and remote-URL metadata are omitted.

## Adaptations

Official curl uses `-u your_private_api_key:`. Native Basic uses `http.auth.basic` with the private key as username and an empty password, matching pinned `Buffer.from(\`${apiKey}:\`)`. Native category is `dev-tools` (source Design & Media/Storage are not in native CATEGORIES). The upstream user-agent is not sent. Pinned `fileType` values `all|image|non-image` are retained from source; current docs also describe a `type` query and Lucene `searchQuery` on the same list endpoint.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://imagekit.io/docs/api-keys and https://imagekit.io/docs/api-reference/digital-asset-management-dam/list-and-search-assets. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
