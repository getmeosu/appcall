# JobNimbus

International **JobNimbus Open API** recipe for the contractor CRM at [jobnimbus.com](https://www.jobnimbus.com). JobNimbus is a Lehi, Utah company. This is the Open API at `https://app.jobnimbus.com/api1`, not the newer Platform API at `https://api.jobnimbus.com`.

## Setup

Create an API key in JobNimbus under Settings > API Keys and store it as `apiKey`. Requests send `Authorization: Bearer <apiKey>` and `Accept: application/json`.

## Operations

- `healthcheck`: `GET /contacts?size=1` with empty input (cheap authenticated list probe).
- `contacts.list`: `GET /contacts` with optional `size` (1–1000), `from`, `fields`, `filter`, `sort_field`, `sort_direction`. Maps to JOBNIMBUS_CONTACT_LIST.
- `contacts.get`: `GET /contacts/{contactId}`. Maps to JOBNIMBUS_CONTACT_GET.
- `contacts.update`: `PUT /contacts/{jnid}` mapping Composio camelCase to Open API snake_case. Maps to JOBNIMBUS_CONTACT_UPDATE.
- `jobs.list` / `jobs.get`: origin Open API job reads (not in the Composio 21-tool set).
- `account.settings.get`: `GET /account/settings`. Maps to JOBNIMBUS_ACCOUNT_GET_SETTINGS.
- `account.locations.create`: `POST /account/location`. Maps to JOBNIMBUS_ACCOUNT_CREATE_LOCATION.
- `account.filetypes.create`: `POST /account/filetype`. Maps to JOBNIMBUS_CREATE_FILE_TYPE.
- `account.workflows.status.create`: `POST /account/workflow/{workflowid}/status`. Maps to JOBNIMBUS_CREATE_WORKFLOW_STATUS.
- `activities.list` / `activities.get`: Open API activities. Maps to JOBNIMBUS_LIST_ACTIVITIES / JOBNIMBUS_ACTIVITY_GET.
- `tasks.create` / `tasks.list` / `tasks.update`: Open API tasks. Maps to JOBNIMBUS_CREATE_TASK / JOBNIMBUS_TASK_LIST / JOBNIMBUS_UPDATE_TASK.
- `files.get`: `GET /files/{jnid}`. Maps to JOBNIMBUS_FILE_GET.
- `products.list` / `products.get`: `GET /v2/products`. Maps to JOBNIMBUS_LIST_PRODUCTS / JOBNIMBUS_PRODUCT_GET.
- `materialorders.list` / `materialorders.create`: `GET|POST /v2/materialorders`. Maps to JOBNIMBUS_LIST_MATERIAL_ORDERS / JOBNIMBUS_CREATE_MATERIAL_ORDER.
- `workorders.list`: `GET /v2/workorders`. Maps to JOBNIMBUS_LIST_WORKORDERS.
- `invoices.list`: `GET /v2/invoices`. Maps to JOBNIMBUS_LIST_INVOICES.
- `payments.list`: `GET /payments`. Maps to JOBNIMBUS_LIST_PAYMENTS.
- `utility.uoms.list`: `GET /utility/uoms`. Maps to JOBNIMBUS_UTILITY_GET_UOMS.

Successful responses are raw provider JSON under AppCall `data`. List endpoints return `{ count, results }`.

## Adaptations

Official support still documents the Open API Postman collection (`https://app.jobnimbus.com/api1`, Bearer token, `size`/`from`). The Platform API authorization page uses `https://api.jobnimbus.com/{service}/v1/{endpoint}`, a different surface; this recipe keeps the Open API host and paths that the pinned source implements.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
