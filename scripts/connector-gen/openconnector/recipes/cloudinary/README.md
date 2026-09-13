# Cloudinary

Read-only international **Cloudinary Admin API** recipe. Copy the cloud name, API key, and API secret from Cloudinary Console Settings > API Keys. Store them as `cloudName`, `apiKey`, and `apiSecret`. The runner sends HTTP Basic authentication (`apiKey:apiSecret`) and `Accept: application/json` to `https://api.cloudinary.com/v1_1/{cloudName}`.

## Operations

- `healthcheck`: `GET /resources/image/upload?max_results=1` with empty input (cheap authenticated one-asset list; pinned credential validator).
- `assets.list`: `GET /resources/{resourceType}/upload` with required `resourceType` (`image`|`video`|`raw`) and optional `prefix`, `maxResults` (1–500), `nextCursor`, `direction` (`asc`|`desc`), `includeTags`, and `includeContext`.
- `assets.get`: `GET /resources/{assetId}`; `assetId` is a required non-empty string.

Successful responses are raw provider JSON under AppCall `data`. Multipart uploads, explicit updates, and renames are omitted.

## Adaptations

Official curl uses `-u API_KEY:API_SECRET` against `https://api.cloudinary.com/v1_1/<CLOUD_NAME>/...`. Native Basic matches pinned `Buffer.from(\`${apiKey}:${apiSecret}\`)`. Native category is `dev-tools` (source Design & Media/Storage are not in native CATEGORIES). The upstream user-agent is not sent. Official list examples often use `GET /resources/image`; pinned list/validator uses `/resources/{resourceType}/upload`. Native matches the pinned `/upload` type path. Official Admin API rate-limit status is HTTP 420; native retries 420 and 429. EU/AP `api-eu`/`api-ap` hosts are a premium Enterprise option and are not this edition.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://cloudinary.com/documentation/admin_api. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
