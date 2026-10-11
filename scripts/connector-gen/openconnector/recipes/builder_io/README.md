# Builder.io

International **Builder.io Content API v3** recipe. Configure the **public API key** from Space Settings. Requests send `apiKey` as a query parameter to `https://cdn.builder.io`. Official Content API docs require `apiKey` (not `apikey`).

Covered operations: credential-only `healthcheck`, Content API reads (`content.list`, `content.get`, `content.getById`, `content.getByEntry`, `content.getByUrl`, `content.getByUrlPath`, `content.query`), HTML API reads (`html.get`, `html.getByUrl`, `html.getByEntry`, `html.getByUrlPath`), and convenience lists for `page`, `symbol`, and `section` models. Write API create/update/delete and dual-host Write API (`builder.io`) remain omitted because they require a private key.

Native category is `dev-tools`. Pinned source sends `Authorization: Bearer` with a private key on Content API reads; native follows official query-only public-key auth.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the public API key, call `healthcheck` with `{}`, then `content.list` with a model name.
