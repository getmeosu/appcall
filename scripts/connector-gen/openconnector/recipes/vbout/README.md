# VBOUT

Read-only VBOUT API v1 recipe for VBOUT Inc. (New York). Configure a User or Application API key from Settings > API Integrations. The runner sends it as the documented `key` query parameter to `https://api.vbout.com/1` plus `Accept: application/json`.

Selected operations are credential-only `healthcheck` (`GET /app/me.json`), `account.get`, `lists.list`, `lists.get` (required `listId` as `id`), and `contacts.list` (required `listId` as `listid`). Contact create/update/delete writes are omitted.

Official paths are lowercase with a `.json` suffix. Pinned source used PascalCase without `.json`. Invalid keys often return HTTP 200 with `response.data.errorMessage`; native `bodyErrorPaths` demote those. `response.header.status` is not used because success `ok` is a non-empty string. Native category is `email-marketing`. `skipDnsValidation` is an upstream SDK concern; native pins `api.vbout.com`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://developers.vbout.com/docs/. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure an API key, call `healthcheck` with `{}`, then `lists.list`.
