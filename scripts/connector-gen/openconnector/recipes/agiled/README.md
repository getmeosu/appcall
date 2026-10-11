# Agiled

International Agiled REST API v1 recipe covering origin healthcheck plus every Composio `AGILED_*` HTTP tool (18 tools, 20 operations). `healthcheck` is an authenticated `GET /users` probe and is not a Composio slug. Origin `contacts.get` (`GET /contact/{id}`) is kept; Composio has list-only contacts.

Configure an API token from Settings > API Settings and the account URL (Brand) from the browser address bar after sign-in, such as `https://your-company.agiled.app`. The runner sends `api_token` as a query parameter and `Brand` as a header to `https://my.agiled.app/api/v1`.

## Operations

- Auth: `healthcheck` (`GET /users`).
- Users: `users.list` (`GET /users`, AGILED_GET_USERS).
- Contacts: `contacts.list` (optional `page` / `per_page` / `search`), `contacts.get`.
- Projects: `projects.list`, `projects.create`, `projectCategories.list`.
- Tasks: `tasks.list`, `tasks.create` (Composio `title` → official `heading`, `assigned_to` → `user_id`).
- Tickets: `tickets.list`, `tickets.create` (`message` is sent as official `description` and `message`).
- Expenses: `expenses.list`, `expenses.create`.
- Finance / CRM lists: `invoices.list`, `estimates.list`, `products.list`, `currencies.list`, `deals.list`.
- People: `employees.list`.
- Time: `timesheets.list` (`GET /timelogs/{project_id}`).

A marketing FAQ claiming Bearer authentication is not used; official OpenAPI and the pinned source use `api_token` plus `Brand`. The API host is fixed at `my.agiled.app`; Brand is a stored account-URL header, not a caller-supplied request host. Optional query/body fields are omitted when unset. Native categories are `crm` and `productivity`. The upstream user-agent is not sent. Responses keep raw Agiled JSON under `data`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://api.agiled.app/docs and https://help.agiled.app/article/60-how-to-get-agiled-api-key. Composio: https://docs.composio.dev/toolkits/agiled. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API token and Brand origin URL, call `healthcheck` with `{}`, then `contacts.list`.
