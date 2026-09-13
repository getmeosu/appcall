# ByteForms

**HOLD.** Official ByteForms REST recipe at `https://api.forms.bytesuite.io`. Create an API key from Account > API Key. The runner sends the raw key in `Authorization` with no Bearer prefix, plus `Accept: application/json`.

Operator legal-entity name and geography were not evidenced in bounded 2026-09-13 coverage (no privacy/terms/imprint pages). Unknown geography/operator is HOLD, never APPROVED. INR pricing on `/plans` is recorded and is not a substitute for operator identity.

Covered operations (not admitted): `healthcheck` / `forms.list` (`GET /api/form`), `forms.get` (`GET /api/form/{formId}`), and `form-responses.list` (`GET /api/form/responses/{formId}`). The pinned after/before XOR is omitted.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://forms.bytesuite.io/docs/api. Fixtures are independently derived and do not represent live provider access. Live authentication remains unverified.
