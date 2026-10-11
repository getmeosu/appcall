# Nusii Proposals

International **Nusii Proposals REST API v2** recipe covering the Composio `NUSII_PROPOSALS` toolkit (29 indexed tools). Create or view a token under Nusii Settings → API and store it as `apiKey`. Requests send `Authorization: Token token=<key>` and `Accept: application/json` to `https://app.nusii.com/api/v2`. Write calls also send `Content-Type: application/json`.

## Operations

Origin/main six operations are retained:

- `healthcheck` / `account.get`: `GET /account/me` (NUSII_PROPOSALS_GET_ACCOUNT_ME).
- `clients.list`: `GET /clients` (NUSII_PROPOSALS_LIST_CLIENTS).
- `clients.get`: `GET /clients/{id}` (NUSII_PROPOSALS_GET_CLIENT).
- `proposals.list`: `GET /proposals` (NUSII_PROPOSALS_LIST_PROPOSALS).
- `templates.list`: `GET /templates` (origin extra; Composio has no LIST_TEMPLATES slug).

The remaining Composio NUSII_PROPOSALS tools are request-backed actions on the same host: client/proposal/section/line-item/webhook CRUD, archive proposal, list activities/users/themes, and list section line items. Recipe operations equal runner operations.

## Adaptations

Pinned source and official docs agree on `https://app.nusii.com/api/v2/` and `Token token=`. Native base URL omits the trailing slash and uses `/account/me` paths. Native category is `productivity` (source Communication is not in the Rust CATEGORIES allowlist). Official docs recommend User-Agent and Content-Type; native omits the upstream user-agent and sends Content-Type only on JSON write bodies. `recipient_emails` array is omitted because native query templates cannot comma-join; use `recipient_email`. Composio `UPDATE_CLIENT` is a nested `client` object forwarded as the JSON:API envelope. Composio `LIST_LINE_ITEMS` maps to `GET /line_items` with `page`/`per`; official docs only document section-scoped listing as `line_items.list_for_section`.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://developer.nusii.com/ and https://docs.composio.dev/toolkits/nusii_proposals. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
