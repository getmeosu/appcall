# BaseLinker

Read-only **and write** BaseLinker / Base.com `connector.php` recipe at `https://api.baselinker.com`. Configure an API token from Account & other → My account → API. Requests send `X-BLToken` and an `application/x-www-form-urlencoded` body with `method` plus `parameters` as a JSON string.

## Setup

Generate a token in the BaseLinker panel and store it as `apiKey`. The runner does not send a fake Authorization header.

## Operations

Origin list reads remain:

- `healthcheck`: `POST /connector.php` `method=getOrderStatusList` with `parameters={}`.
- `statuses.list`: `getOrderStatusList`.
- `orders.list`: `getOrders` with optional official filters (`date_from`, `status_id`, `filter_email`, …).
- `inventories.list`: `getInventories`.
- `warehouses.list`: `getInventoryWarehouses`.

This revision adds the remaining Composio BASELINKER tools (106 tools total) as real `connector.php` methods. Nested `parameters` JSON is serialized by the handwritten client because declarative form encoding cannot nest JSON objects. Compiled request blocks still post `parameters={}` so empty-parameter list methods work without the registry patch; registered handlers win and send the structured input.

Successful responses are raw provider JSON under AppCall `data`.

BaseLinker answers many failures, including a bad token, as HTTP 200 with `{ "status": "ERROR", "error_message": "...", "error_code": "..." }`. `http.errors.bodyErrorPaths` is `["error_message"]` so those bodies are connector errors. Do not put `status` on `bodyErrorPaths`: the success value `"SUCCESS"` is a non-empty string.

Native category is `ecommerce` (source Productivity/Data).

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://api.baselinker.com/. Composio toolkit: https://docs.composio.dev/toolkits/baselinker (106 tools, version 20260917_00). Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
