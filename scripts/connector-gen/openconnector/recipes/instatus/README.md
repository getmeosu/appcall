# Instatus

Instatus API recipe for the international status-page product. Store an API key from User settings → Developer settings. Requests use `https://api.instatus.com` with `Authorization: Bearer` and `Accept: application/json`.

## Operations

- `healthcheck`: `GET /v2/pages` with empty input.
- `pages.list`: `GET /v2/pages` with optional `page` and `perPage`.
- `components.list` / `components.get`: Help `GET /v2/{pageId}/components`.
- `components.create` / `components.update` / `components.delete`: OpenAPI v1 writes.
- `incidents.list` / `incidents.get` / `incidents.create` / `incidents.update` / `incidents.delete`.
- `incidentUpdates.create`: `POST /v1/{pageId}/incidents/{incidentId}/incident-updates`.
- `maintenances.list` / `maintenances.get` / `maintenances.create` / `maintenances.update` / `maintenances.delete`.
- `subscribers.list` / `subscribers.create` / `subscribers.delete`.
- `metrics.list`, `teammates.list`, `templates.list`.
- `webhook.incident_updated` / `webhook.maintenance_updated` / `webhook.component_updated`: EventOnly inbound webhooks.

Successful HTTP responses are preserved as raw provider JSON under AppCall `data`.

## Testing and live smoke

Fixtures are supplied evidence only. They do not prove live credentials. For live smoke, use a least-privilege key, invoke `healthcheck`, then list pages.

Upstream definitions/runtime are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector), pinned at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`.
