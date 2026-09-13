# Checkly

Read-only Checkly Public API recipe for the international Checkly service. Configure a user or service API key and the target account ID; the runner sends `Authorization: Bearer` and `x-checkly-account`. Covered operations are credential-only `healthcheck`, `checks.list`, `checks.get`, and `checkStatuses.list`. Responses preserve the provider JSON under the operation result keys. Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Live smoke is unverified.

The required `accountId` field is validated during connection setup before any Checkly operation runs. The missing-field zero-fetch regression is tracked in the Rust setup regression lane rather than as a Bun recipe fixture (`MISSING_SETUP_FIELD`).
