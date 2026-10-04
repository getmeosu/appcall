# Quaderno

International Quaderno production API recipe. Configure an API key from https://quadernoapp.com/users/api-keys and the account subdomain from the account URL (or from `GET /authorization`). Auth is HTTP Basic with username `apiKey` and a blank password against production `*.quadernoapp.com`. Sandbox hosts are not admitted.

Covered operations (v0.2.0): credential-only `healthcheck` (`GET https://quadernoapp.com/api/authorization`), contact and product CRUD (`/items` for products), invoice list/get/create, credit-note list/get, expense and receipt lists, `tax_rates.calculate`, `tax_ids.validate` on the shared authorization host, and `transactions.create`. EventOnly webhooks: `webhook.invoice_created`, `webhook.contact_created`, `webhook.payment_created`. Required stored `accountSubdomain` interpolates `https://{{accountSubdomain}}.quadernoapp.com/api` with allowedHosts `quadernoapp.com` and `*.quadernoapp.com`. Raw Quaderno JSON is returned under `data`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache-2.0). Official docs: https://developers.quaderno.io/api/. Fixtures are independently derived from official docs plus pinned source; live authentication remains unverified.
