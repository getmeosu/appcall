# Metabase

HOLD. Pinned OpenConnector requires a caller-supplied HTTPS `instanceUrl` for self-hosted Metabase and Metabase Cloud, including Pro/Enterprise custom domains. A documented Cloud default host (`*.metabaseapp.com`) exists, and this recipe sketches the Grafana-style stored site slug, but self-hosted and custom-domain hosts remain first-class. Catalog admission is HOLD.

If later admitted for Cloud only: configure a Metabase Cloud site slug plus an API key from Admin settings → Authentication → API keys. The runner would send `x-api-key` to `https://<site>.metabaseapp.com/api`.

Covered operations (not admitted): credential-only `healthcheck` (`GET /api/user/current`), `databases.list`, `collections.list`, `dashboards.list`, and `cards.list`. Search, writes, and MCP actions are omitted.

August 2026 Metabase Cloud zero-day CVE-2026-72898 was exploited against Cloud and patched 2026-08-06; subsequent self-hosted customer incidents are recorded.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://www.metabase.com/docs/latest/api. Fixtures are independently derived and do not represent live provider access. Live smoke is unverified.
