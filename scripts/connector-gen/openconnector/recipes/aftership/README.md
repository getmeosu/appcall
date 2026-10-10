# AfterShip

AfterShip Tracking API recipe for the international product at `api.aftership.com`. Configure an organization API key from AfterShip settings; the runner sends it as the official `as-api-key` header.

Covered operations: credential-only `healthcheck` (`GET /couriers?active=true`), courier list/detect, tracking CRUD plus retrack and mark-completed, courier connections, and estimated-delivery-date prediction. EventOnly webhooks cover `tracking_update`, `edd_revise`, and `tracking_pending_time`.

The pinned source uses Tracking API version `2026-01`. Current AfterShip docs default to `2026-07`; `2026-01` remains a dated, still-documented version rather than a broken host.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Fixtures are independently derived from official docs plus pinned source and do not represent live provider access.
