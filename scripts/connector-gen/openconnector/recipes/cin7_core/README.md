# Cin7 Core

Read-only international Cin7 Core External API v2 recipe. Create an Account ID and API Application Key on https://inventory.dearsystems.com/ExternalAPI. The runner sends `api-auth-accountid` and `api-auth-applicationkey` to `https://inventory.dearsystems.com/ExternalApi/v2`.

Covered operations: credential-only `healthcheck` (`GET /me`), `customers.list`, `customers.get` (`GET /customer?ID=`), and `products.list`. Product get and writes are omitted. Optional customer/product include flags are omitted.

Adaptations versus the pinned OpenConnector source: native omits `Content-Type` on GET and the upstream user-agent; `customers.get` returns the raw list wrapper under `data` rather than unwrapping the first record; native category is `ecommerce` rather than Data/Finance.

August 2016 historical Cin7 POS/server malware reporting is recorded under the 2026-09-13 waiver and does not hold this edition.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://dearinventory.docs.apiary.io/. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
