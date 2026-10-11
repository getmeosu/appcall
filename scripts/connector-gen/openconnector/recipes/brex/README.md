# Brex

Configure a Brex dashboard user token. The runner sends `Authorization: Bearer <token>` to `https://api.brex.com`. Operations cover the Composio BREX toolkit: Team, Transactions, Expenses, Budgets, Payments, Webhooks, Onboarding, Fields, and Travel APIs. Raw provider JSON is returned under `data`. Live smoke testing is unverified.

Handwritten handlers: `users.get` (optional `user_id` / `me`), `cash.statements.list` (primary cash account then statements), `cards.update_status` (lock/unlock/terminate), and transaction get/amount/description filters on `GET /v2/transactions/card/primary`.
