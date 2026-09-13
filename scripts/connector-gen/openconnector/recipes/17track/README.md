# 17TRACK

Read-only international 17TRACK Tracking API v2.4 recipe at `https://api.17track.net/track/v2.4`. Configure the API key from 17TRACK API Settings (`https://api.17track.net/admin/settings`). The runner sends it as the official `17token` header with `Accept` and `Content-Type: application/json`.

Covered operations: credential-only `healthcheck` and `quota.get` (`POST /getquota`), `trackings.list` (`POST /gettracklist`), and `trackings.get` (`POST /gettrackinfo`). Register, retrack, stop, delete, carrier change, and real-time lookup are omitted as writes or billed tracking actions. `gettracklist` does not initiate tracking.

HTTP 200 illegal-parameter envelopes `{code:0,data.errors:[...]}` are demoted via `bodyErrorPaths: ["data.errors"]`. `code` is not used as a body-error path because success `0` would trip a numeric path.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://asset.17track.net/api/document/v2.4_en/index.html. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure the API key, call `healthcheck` with `{}`, then `quota.get`.
