# Pingdom reviewed recipe

Pingdom API 3.1 using bearer authentication against `https://api.pingdom.com/api/3.1`. Live access is unverified.

## Operations

- `healthcheck`: `GET /checks?limit=1`.
- `checks.list`: `GET /checks` with optional `limit`.
- `checks.get`: `GET /checks/{checkid}`.
- `checks.create`: `POST /checks`.
- `checks.update`: `PUT /checks/{checkid}`.
- `checks.delete`: `DELETE /checks/{checkid}`.
- `results.list`: `GET /results/{checkid}`.
- `analysis.list`: `GET /analysis/{checkid}`.
- `summary.average`: `GET /summary.average/{checkid}`.
- `summary.outage`: `GET /summary.outage/{checkid}`.
- `probes.list`: `GET /probes`.
- `credits.get`: `GET /credits`.
- `contacts.list`: `GET /alerting/contacts`.
- `teams.list`: `GET /alerting/teams`.
- `maintenance.list`: `GET /maintenance`.
- `actions.list`: `GET /actions`.
- `webhook.check_down` / `webhook.check_up`: EventOnly inbound state-change webhooks when a check goes DOWN/FAILING or recovers to UP/SUCCESS.

Fixtures use the deterministic token `fixture-api-token`.
