# Curated OpenConnector import

AppCall retains 36 legacy connectors and curated templates alongside the new recipe/catalog path. The pinned source inventory covers all 1,498 upstream providers; it is not a fully screened or approved catalog. Missing research or recipe evidence defaults to `HOLD`. The 2026-09-13 policy waives permanent exclusion for historical incidents affecting non-China companies, while current credible unresolved security issues remain held. Mainland-China-focused editions remain excluded; international Chinese ownership alone is not exclusion. TikTok’s exception is limited to the exact global `tiktok_business` → `tiktok-ads` mapping and does not waive operational gates.

Recipes contain the manifest, source pin, operation mappings, research, fixtures, and setup README. The build pipeline validates pinned source files, selection, semantics, and fixture execution. The emitter replays accepted recipes, copies only verified referenced fixtures and README files, preserves the upstream license and NOTICE, and records runtime fingerprints and hashes. Research, fixtures, generated output, and tests do not prove live-provider access or breach-free status. New authored recipes and the broader dossier remain under review.

The legacy provider importer supports the actual flags below:

```sh
bun run scripts/connector-gen/openconnector/index.ts --provider coda --source /path/to/open-connector
bun run scripts/connector-gen/openconnector/index.ts --provider helpscout --source /path/to/open-connector --out /tmp/appcall-openconnector-output
```

The source must be revision `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. The recipe/catalog pipeline accepts an explicit `--as-of` value through its API; emitted staging directories must be fresh direct children of the platform temporary directory (for example `/tmp` on macOS/Linux). Cross-platform callers should use the platform temporary-directory API rather than assuming `/tmp`.
