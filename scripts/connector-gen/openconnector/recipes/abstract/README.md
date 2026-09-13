# Abstract

HOLD. Official international Abstract Email Validation API at `https://emailvalidation.abstractapi.com`. Configure the Email Validation API key from the Abstract dashboard. The runner sends it as the `api_key` query parameter.

Pinned OpenConnector exposes only `validate_email`. Official docs bill one credit per submitted email, including invalid addresses. There is no cheap account/status/quota GET. The native credential validator is billed `GET /v1/?email=test@example.com`. Billable validation is not used as a healthcheck. `operationQuality` remains unproven, so selection is HOLD.

Covered operations (not admitted): `emails.validate`. Distinct from Abstract (goabstract.com) design version control and from Abstract L2/Cardex.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.abstractapi.com/api/email-validation. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
