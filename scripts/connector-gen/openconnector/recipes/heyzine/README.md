# Heyzine

International **Heyzine REST API** recipe covering origin healthcheck plus every Composio `HEYZINE_*` HTTP tool (16 tools, 20 operations). Healthcheck, `flipbooks.get`, and bookshelf list ops are not Composio slugs.

Copy the API key from the Heyzine developers page and store it as `apiKey`. Requests send `Authorization: Bearer` and `Accept: application/json` to `https://heyzine.com` (jQuery plugin from `cdn.heyzine.com`). REST conversion also needs the dashboard **client id** as `k` / `client_id` input.

## Operations

- `healthcheck`: `GET /api1/flipbook-list` with empty input (pinned credential validator).
- `flipbooks.list` (`HEYZINE_GET_FLIPBOOK_LIST`): `GET /api1/flipbook-list`. Optional `tag`, `page`, `limit`, `search` are omitted when unset; official list has no pagination.
- `flipbooks.get`: `GET /api1/flipbook-details?id=`.
- `bookshelves.list`: `GET /api1/bookshelf-list`.
- `bookshelves.flipbooks.list`: `GET /api1/bookshelf-flipbooks?id=`.
- `flipbooks.create.link` (`HEYZINE_CREATE_FLIPBOOK_LINK`): official `GET /api1?pdf=&k=`. Browser 302s are blocked by the connector HTTP boundary; a JSON 200 is the documented REST conversion shape.
- `flipbooks.create.async` / `flipbooks.create.sync`: `POST /api1/async` and `POST /api1/rest`.
- `flipbooks.delete`: `POST /api1/flipbook-delete`. Handwritten so HTTP 200 `{success:true, msg:...}` is not treated as an error (`bodyErrorPaths: ["msg"]` still catches `{success:false, msg:...}` on list endpoints).
- `limits.get`: `GET /api1/limits`.
- `flipbooks.embed.get` / `flipbooks.id_tool.get` / `flipbooks.social.get`: `GET /api1/flipbook-details` with mapped `data`.
- `jquery.plugin.get`: `GET https://cdn.heyzine.com/release/jquery.pdfflipbook.4.js`.
- `oembed.get`: `GET /api1/oembed`.
- `webhooks.setup`: connectivity `GET /api1/flipbook-list` plus UI guidance (`https://heyzine.com/account/#scripts`). Heyzine has no webhook registration API.
- `flipbooks.access_list.update`: handwritten `POST /api1/access-add` once per Composio `access_list` entry using official `name`, `access_type`, `user`, and `password` (success includes `msg`).
- `flipbooks.password.update`: `POST /api1/access-setup` (handwritten).
- `flipbooks.social.update`: `POST /api1/flipbook-social` (success `{success:true}` has no `msg`).
- `webhooks.leads`: inbound leads webhook, `sideEffect: read`. EventOnly; no runner handler.

Successful JSON responses are raw provider JSON under AppCall `data` unless a `request.result` mapping is declared. Native `bodyErrorPaths` treat a non-empty top-level `msg` as the error signal on compiled GETs because they cannot invert a success boolean.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus Composio tool schemas and are fixture-only; live smoke is unverified.
