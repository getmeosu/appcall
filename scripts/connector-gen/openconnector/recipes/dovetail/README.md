# Dovetail

International Dovetail Public API recipe at `https://dovetail.com/api`. Generate a personal API key in Settings → Account → Personal API keys. The runner sends `Authorization: Bearer`. Alternate `dovetailapp.com` host is not admitted.

Origin/main read surface is unchanged: credential-only `healthcheck` (`GET /v1/token/info`), `projects.list` with optional `limit`, `data.list` with optional `projectId`, and `data.get`. Additional operations cover the remaining Composio DOVETAIL tools (channels, contacts, docs, insights, notes, folders, files, highlights, tags, topics, import/export, and Magic Search). Provider next cursors are never followed.

Native category is `productivity` (source Data is not in the Rust CATEGORIES allowlist).

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://developers.dovetail.com/docs/authorization. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
