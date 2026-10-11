# Quaderno

International Quaderno production API recipe. Configure an API key from https://quadernoapp.com/users/api-keys and the account subdomain from the account URL (or from `GET /authorization`). Auth is HTTP Basic with username `apiKey` and a blank password against production `*.quadernoapp.com`. Sandbox hosts are not admitted.

Covered operations (v0.3.0): origin v0.2.0 contact/product/invoice/credit/expense/receipt/tax/transaction tools plus the remaining Composio Quaderno HTTP toolkit (coupons, estimates/proformas, evidence, expenses CRUD and payments, receipts, recurrings, reporting, registered tax IDs, webhooks, checkout sessions, jurisdictions, tax codes, deliveries, invoice payments, ping). EventOnly inbound webhooks: `webhook.invoice_created`, `webhook.contact_created`, `webhook.payment_created`. Required stored `accountSubdomain` interpolates `https://{{accountSubdomain}}.quadernoapp.com/api` with allowedHosts `quadernoapp.com` and `*.quadernoapp.com`. Raw Quaderno JSON is returned under `data`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache-2.0). Official docs: https://developers.quaderno.io/api/. Fixtures are independently derived from official docs plus pinned source; live authentication remains unverified.
