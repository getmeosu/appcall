# IT Glue

Read-only international IT Glue JSON:API recipe pinned to the documented default US host `api.itglue.com`. Configure an Administrator API key from Account > Settings > API Keys. The runner sends `x-api-key` and `Accept: application/vnd.api+json` to `https://api.itglue.com`.

Covered operations: credential-only `healthcheck` (`GET /users?page[size]=1`), `users.list`, `users.get`, `organizations.list`, and `organizations.get`. Password, attachment, configuration, contact, and write endpoints are omitted.

EU (`api.eu.itglue.com`) and AU (`api.au.itglue.com`) hosts are not expressed: the source maps a stored region enum onto three hostnames, and the US value is not `api.us.itglue.com`, so a bounded wildcard plus required stored id cannot represent the mapping. `include` arrays are omitted because the native query template cannot comma-join them.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://api.itglue.com/developer and https://help.itglue.kaseya.com/help/Content/1-admin/it-glue-api/getting-started-with-the-it-glue-api.html. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `users.list`.
