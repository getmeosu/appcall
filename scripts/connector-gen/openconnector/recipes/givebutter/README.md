# Givebutter

International **Givebutter REST API v1** recipe covering the origin healthcheck plus every Composio `GIVEBUTTER_*` HTTP tool (58 tools, 59 operations including healthcheck).

## Setup

Create an API key from the Givebutter Dashboard under Settings → Integrations → API Keys. Store it as `apiKey`. Requests send `Authorization: Bearer <key>` and `Accept: application/json` to `https://api.givebutter.com`.

## Operations

- Origin reads: `healthcheck`, `campaigns.list` / `campaigns.get`, `contacts.list` / `contacts.get`.
- Writes use official `/v1` paths (campaigns, contacts, tickets, discount codes, funds, households, transactions, webhooks, tags, activities).
- Composio `UPDATE_*_PUT` tools share the official PUT endpoints with alternate path parameter names.
- `payment_method` on `transactions.create` is sent as official `method`.
- Composio `limit` on payouts/plans/transactions/webhooks lists maps to official `per_page`.
- DELETE/archive ops accept 200 or 204 and return `{success: true}`.

Successful JSON responses are raw provider JSON under AppCall `data`. Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Live authentication is unverified.
