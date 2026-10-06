# BigCommerce

International BigCommerce Management API recipe. Configure a Store API account access token and the store hash. The runner sends `X-Auth-Token` to `https://api.bigcommerce.com/stores/{store_hash}/v3`. Version 0.2.0 adds catalog product create/update, categories, brands, variants, customers, v2 orders, and EventOnly webhooks for order, product, and customer created events. `storeHash` is a required stored path identifier. Live authentication is unverified. Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`.
