# BunnyCDN reviewed recipe

Uses the BunnyCDN API with an account API key rendered in the `AccessKey` header. Healthcheck and pull-zone listing call `GET https://api.bunny.net/pullzone`; paged requests use `page` and `perPage` (`perPage` minimum 5). Live authentication remains unverified.
