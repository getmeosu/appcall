# AfterShip

Read-only AfterShip Tracking API recipe for the international product at `api.aftership.com`. Configure an organization API key from AfterShip settings; the runner sends it as the official `as-api-key` header.

Covered operations: credential-only `healthcheck` (`GET /couriers?active=true`), `couriers.list`, `trackings.list`, and `trackings.get`. Create/update/delete/retrack/mark-completed and courier detection are omitted as writes or prediction. Array filters on list trackings are omitted because the native query template cannot comma-join arrays the way the pinned source does.

The pinned source uses Tracking API version `2026-01`. Current AfterShip docs default to `2026-07`; `2026-01` remains a dated, still-documented version rather than a broken host.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `couriers.list`.
