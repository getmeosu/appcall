# Harvest

Harvest REST API v2 time tracking and invoicing. Personal access token plus `Harvest-Account-Id`. Version 0.2.0 maps all 57 Composio HARVEST tools onto declarative HTTP operations, plus existing `healthcheck` and `users.me`.

Auth: Bearer token in `Authorization` and account ID in `Harvest-Account-Id` against `https://api.harvestapp.com`. Allowed host: `api.harvestapp.com`.

Covered families: clients, contacts, company, projects, tasks, time entries, expenses, expense categories, invoices, invoice item categories, invoice messages, invoice payments, estimates, estimate item categories, estimate messages, and users.

No EventOnly webhooks (Composio lists 0 Harvest triggers). Recipe operations equal runner operations. Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://help.getharvest.com/api-v2/. Fixtures are independently derived from official docs; live authentication remains unverified.
