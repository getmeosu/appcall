# Pexels

Pexels API v1 recipe for photos, videos, and collections. Configure an API key from https://www.pexels.com/api/. The runner sends it as the `Authorization` header to `https://api.pexels.com/v1`.

Covered HTTP operations include credential-only `healthcheck`, photo search/curated/get, video search/popular/get, and collection list/get/media. Pexels does not expose vendor webhooks.

Responses preserve raw Pexels JSON under `data`. Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`.
