# Ambient Weather

International Ambient Weather REST API recipe. Configure an `apiKey` and `applicationKey` from https://ambientweather.net/account. Both keys are sent as query parameters to `https://rt.ambientweather.net`. Public map lookups use `https://lightning.ambientweather.net`.

## Operations

- `healthcheck` / `devices.list`: `GET /v1/devices`.
- `devices.latest`: `GET /v1/devices/{macAddress}?limit=1`.
- `devices.history`: `GET /v1/devices/{macAddress}` with optional `limit` (1–288) and `endDate`.
- `stations.nearby` / `stations.get`: public dashboard devices API on lightning.ambientweather.net.
- Latest observation slices (`observations.outdoor` through `observations.battery`): `GET /v1/devices/{macAddress}?limit=1`.
- EventOnly webhooks: `webhook.data`, `webhook.subscribed` (realtime Socket.io events).

Successful responses are raw provider JSON under AppCall `data`.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://github.com/ambient-weather/api-docs. Fixtures are independently derived and do not represent live provider access. Live smoke is unverified.
