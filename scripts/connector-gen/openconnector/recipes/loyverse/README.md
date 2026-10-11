# Loyverse

International **Loyverse API v1.0** recipe. Create a personal access token in Loyverse Back Office integrations and store it as `apiKey`. Requests send `Authorization: Bearer <token>` and `Accept: application/json` to `https://api.loyverse.com/v1.0`.

Covered HTTP operations include merchant healthcheck, stores, items, categories, customers, receipts, employees, inventory, payment types, taxes, and discounts, plus create actions for items, categories, and customers. EventOnly webhooks: `webhook.items.update`, `webhook.customers.update`, `webhook.receipts.update`, `webhook.inventory_levels.update`, `webhook.shifts.create`.

Successful responses are raw Loyverse JSON under AppCall `data`. HTTP 200 bodies with a populated `errors` array are treated as failures via native `http.errors.bodyErrorPaths`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache-2.0). Official docs: https://developer.loyverse.com/docs. Fixtures are independently derived; live smoke is unverified.
