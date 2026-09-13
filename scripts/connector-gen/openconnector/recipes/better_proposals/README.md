# Better Proposals

Read-only international Better Proposals REST recipe for Advantix Technologies Limited (UK). Configure the API key from https://betterproposals.io/2/integrations/api/. The runner sends `Bptoken` and `Accept: application/json` to `https://api.betterproposals.io`.

Healthcheck is documented GET `/settings`. Create, send, and other writes are omitted.

Official docs say every JSON body includes `status` of `success` or `error`. Native `bodyErrorPaths` is `["message"]` so a non-empty error message is a connector error even on HTTP 200; `status` is not used because the success value `success` is a non-empty string.

Operations: `healthcheck`, `brand.get`, `proposals.list`, `proposals.get`, `templates.list`, and `doctypes.list`. Optional `page` and `per_page` are positive integers; proposal lists also accept `document_type_id`. Proposal IDs are URI-encoded.

The native key is `better-proposals` while the upstream directory is `better_proposals`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Fixtures are independently derived and do not represent live provider access. Live authentication is unverified.
