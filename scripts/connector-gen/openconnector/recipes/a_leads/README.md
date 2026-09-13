# A-Leads

HOLD. Official international A-Leads gateway search API at `https://api.a-leads.co/gateway/v1/search`. Configure an API key; the runner sends `x-api-key`.

Pinned OpenConnector actions are billed find/verify lookups. Official MCP documents free get-user-details and saved-search list, but those REST paths are not in the pinned provider. The native credential validator is billed `POST /search/verify-email`. Billable verification is not used as a healthcheck. `operationQuality` remains unproven, so selection is HOLD.

Covered operations (not admitted): `emails.find`, `emails.personal.find`, `phones.find`, `emails.verify`. Native name+website find-email omits the document_id-only anyOf branch.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.a-leads.co/reference/post_find-email. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
