# Cloudflare R2

Read-only Cloudflare R2 REST recipe against `https://api.cloudflare.com/client/v4`. Configure a Cloudflare API token (`Authorization: Bearer`) and pass `accountId` on each call. Bucket list/get and CORS reads use the official REST management API, not AWS Signature Version 4. `generate_presigned_url` (local SigV4 S3 URLs) and the S3-compatible host `{accountId}.r2.cloudflarestorage.com` are omitted. HTTP 200 envelopes with a populated `errors` array are treated as failures via `bodyErrorPaths`.

Operations:

- `healthcheck`: `GET /accounts/{accountId}/r2/buckets?per_page=1` (pinned validator)
- `buckets.list`: `GET /accounts/{accountId}/r2/buckets`
- `buckets.get`: `GET /accounts/{accountId}/r2/buckets/{bucketName}`
- `cors.get`: `GET /accounts/{accountId}/r2/buckets/{bucketName}/cors`

Object download/upload, bucket writes, and OAuth (`dash.cloudflare.com/oauth2`) are omitted. Native category is `dev-tools` (source Storage/Developer Tools). Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived. Live smoke is unverified.
