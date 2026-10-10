# Better Proposals

International Better Proposals REST recipe for Advantix Technologies Limited (UK), covering origin healthcheck plus every Composio `BETTER_PROPOSALS_*` HTTP tool (23 tools, 23 operations). `healthcheck` is documented `GET /settings` and covers `BETTER_PROPOSALS_GET_SETTINGS`.

Configure the API key from https://betterproposals.io/2/integrations/api/. The runner sends `Bptoken` and `Accept: application/json` to `https://api.betterproposals.io`.

Official docs say every JSON body includes `status` of `success` or `error`. Native `bodyErrorPaths` is `["message"]` so a non-empty error message is a connector error even on HTTP 200; `status` is not used because the success value `success` is a non-empty string.

## Operations

- Auth / settings: `healthcheck` (`GET /settings`), `brand.get`, `merge_tags.list`.
- Proposals: `proposals.list`, `proposals.get`, `proposals.count`, `proposals.new.list`, `proposals.opened.list`, `proposals.sent.list`, `proposals.signed.list`, `proposals.paid.list`, `proposals.covers.create`.
- Templates: `templates.list`, `templates.get`.
- Document types: `doctypes.list`, `doctypes.create`.
- Companies: `companies.list`, `companies.get`, `companies.create`.
- Currencies: `currencies.list`, `currencies.get`.
- Quotes: `quotes.list`, `quotes.get`.

Create endpoints send official `application/x-www-form-urlencoded` bodies. Optional `page` and `per_page` are positive integers. Origin `proposals.list` keeps `document_type_id`; status lists accept Composio `type` and send it as official `document_type_id`. Path IDs are URI-encoded. POST `/proposal/create` and POST `/quote/create` are omitted (not in Composio).

The native key is `better-proposals` while the upstream directory is `better_proposals`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Fixtures are independently derived and do not represent live provider access. Live authentication is unverified.
