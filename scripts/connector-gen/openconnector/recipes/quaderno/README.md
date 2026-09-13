# Quaderno

Read-only international Quaderno production API recipe. Configure an API key from https://quadernoapp.com/users/api-keys and the account subdomain from the account URL (or from `GET /authorization`). Auth is HTTP Basic with username `apiKey` and a blank password against production `*.quadernoapp.com`. Sandbox hosts are not admitted.

Covered operations: credential-only `healthcheck` (`GET https://quadernoapp.com/api/authorization`), `contacts.list`, `contacts.get`, `products.list` (`GET /items`), and `products.get`. Optional `q` and `processor_id` are official list filters. Required stored `accountSubdomain` interpolates `https://{{accountSubdomain}}.quadernoapp.com/api` with allowedHosts `quadernoapp.com` and `*.quadernoapp.com` (Algolia-style). Writes, tax calculation, and provider next-page URLs are omitted.

Adaptations: official docs specify a blank Basic password (`-u KEY:`); pinned source sends `apiKey:x`. Native recipe follows official docs. Healthcheck uses a per-operation base URL on the shared authorization host. Native category is `accounting`. Raw Quaderno JSON is returned under `data`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache-2.0). Official docs: https://developers.quaderno.io/api/. Fixtures are independently derived from official docs plus pinned source; live authentication remains unverified.
