# BunnyCDN reviewed recipe

Uses the BunnyCDN API with an account API key rendered in the `AccessKey` header. Healthcheck and pull-zone listing call `GET https://api.bunny.net/pullzone`; `pullzones.get` reads `GET /pullzone/{id}` (optional `includeCertificate`); `pullzones.purge` posts `POST /pullzone/{id}/purgeCache` (optional `CacheTag`, HTTP 204, EffectPolicy Idempotent); `storagezones.list` calls `GET /storagezone` with the same `page`/`perPage` bounds (`perPage` minimum 5). Host stays `api.bunny.net`. Live authentication remains unverified.
