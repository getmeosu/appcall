# ipdata

Read-only ipdata IP intelligence API recipe. Configure the dashboard API key from https://ipdata.co. The runner sends `api-key` as a query parameter to `https://api.ipdata.co` plus `Accept: application/json`. Official docs also mention an `api-key` header; this recipe matches the pinned source query placement.

Selected operations are `healthcheck` (`GET /`, calling-IP lookup used by the pinned credential validator), `ip.lookup` (`GET /{ip}`), `company.get` (`GET /{ip}/company`), and `threat.get` (`GET /{ip}/threat`). Bulk POST, EU host `eu-api.ipdata.co`, ASN extraction, and scalar field fanout are omitted. `ip` is required on lookup/company/threat so the runner does not look up its own egress address. Paths follow official docs without the pinned source `/v1/` prefix on full lookups.

Healthcheck consumes one billed lookup credit. Official usage is the `count` field on lookup JSON; `GET /count` is a billed single-field lookup that official docs return as a scalar.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.ipdata.co/docs/getting-started. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure the API key, call `healthcheck` with `{}`, then `ip.lookup` with a public IP.
