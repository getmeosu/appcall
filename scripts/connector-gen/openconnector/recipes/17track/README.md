# 17TRACK

International 17TRACK Tracking API v2.4 recipe at `https://api.17track.net/track/v2.4`. Configure the API key from 17TRACK API Settings (`https://api.17track.net/admin/settings`). The runner sends it as the official `17token` header with `Accept` and `Content-Type: application/json`.

Covered HTTP operations: `healthcheck` and `quota.get` (`POST /getquota`), `trackings.list` (`POST /gettracklist`), `trackings.get` (`POST /gettrackinfo`), `trackings.register`, `trackings.changeinfo`, `trackings.changecarrier`, `trackings.stop`, `trackings.retrack`, `trackings.delete`, and `trackings.realtime`. EventOnly webhooks: `webhook.tracking_updated`, `webhook.tracking_stopped`.

HTTP 200 illegal-parameter envelopes `{code:0,data.errors:[...]}` are demoted via `bodyErrorPaths: ["data.errors"]`. `code` is not used as a body-error path because success `0` would trip a numeric path.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://asset.17track.net/api/document/v2.4_en/index.html. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure the API key, call `healthcheck` with `{}`, then `quota.get`.
