# Cartes.io

Read-only international Cartes.io hosted REST API recipe for M Media (M-Media-Group, South of France, verified domain mmediagroup.fr). Create an API token at `https://app.cartes.io/account/api-token`. The runner sends the raw token in `Authorization` (not Bearer) to `https://cartes.io/api`, matching official docs and pinned source.

Covered operations: credential-only `healthcheck` (`GET /user`), `maps.list`, `maps.get`, and `markers.list`. Optional `page`, `withMine`, `orderBy`, `map_token`, and `show_expired` match official query names. `ids[]` / `category_ids[]` array filters and writes are omitted. Native category is `dev-tools` (source Data/Developer Tools).

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache-2.0). Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API token, call `healthcheck` with `{}`, then `maps.list`.
