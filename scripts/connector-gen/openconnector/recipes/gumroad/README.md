# Gumroad

Read-only international Gumroad API v2 recipe. Configure an access token generated from the application page. The token is sent as the documented `access_token` query parameter. Healthcheck is GET `/v2/user`. Refund, ship, and receipt-resend writes are omitted.

Operations: `healthcheck`, `products.list`, `products.get`, `sales.list`, and `sales.get`. Sales filters (`after`, `before`, `productId`, `email`, `pageKey`) are caller controlled; `next_page_url` is metadata and is never followed. Product and sale IDs are URI-encoded.

Gumroad may answer HTTP 200 with `{success:false, message:...}`. Native `bodyErrorPaths` cannot invert a success boolean, so a non-empty top-level `message` is treated as the documented false-success error signal.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Live authentication is unverified.
