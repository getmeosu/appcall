# BigPicture.io

**HOLD.** Official international BigPicture Company and IP APIs (`https://company.bigpicture.io`, `https://ip.bigpicture.io`). Configure an API key from https://app.bigpicture.io. The runner would send the raw key in `Authorization` with no Bearer prefix.

Official docs charge credits on usage; Company and IP lookups are billed unique calls per 30-day period. Pinned OpenConnector actions are only `find_company_by_domain` and `find_company_by_ip`. The credential validator is a billed `GET /v2/companies/ip`. There is no cheap authenticated account read for healthcheck, so `operationQuality` remains unproven.

Covered operations (not admitted): `healthcheck` and `companies.ip.get` (`GET /v2/companies/ip`), `companies.domain.get` (`GET /v1/companies/find`). Official quickstart curl uses `/v1/companies/find/stream`; native would follow the API reference and pinned source `/v1/companies/find`. Webhooks and HTTP 202 async polling are omitted.

Native category is `crm` (source Data/Marketing are not both in native CATEGORIES). Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.bigpicture.io/api/. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified. This recipe is not admitted.
