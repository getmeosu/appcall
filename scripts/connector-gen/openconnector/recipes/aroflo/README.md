# AroFlo

**HOLD.** Current official AroFlo help and https://apidocs.aroflo.com/ document HMAC-SHA512 authentication against `https://api.aroflo.com/` (no `/v2`). The pinned OpenConnector connector uses Bearer tokens against `https://api.aroflo.com/v2` and cites https://docs.api.aroflo.com/guides/authentication/. The Developer Hub at docs.api.aroflo.com exists as a JavaScript site but did not yield a verifiable Bearer/v2 endpoint specification on 2026-09-13. HMAC-SHA512 signing is an unsupported native request semantic. Do not guess the v2 contract.

Native operations in this recipe describe what a Bearer `/v2` mapping would look like (healthcheck `GET /clients?_fields=id,name` matching the pinned validator, not public `GET /healthcheck`) and are not admitted. Native category is `productivity`. Operator: AroFlo Innovations Pty Ltd (Simpro Group), Melbourne, Australia.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://help.aroflo.com/en_US/integrations/aroflo-api and https://apidocs.aroflo.com/. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified. This recipe is not admitted.
