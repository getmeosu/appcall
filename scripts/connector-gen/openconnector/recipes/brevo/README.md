# Brevo

**HOLD.** Official international Brevo Marketing API v3 at `https://api.brevo.com`. Configure an API key from SMTP & API > API Keys. The runner would send `api-key`. Cheap authenticated `GET /v3/account` exists, but this recipe is not admitted.

On 2026-09-10 Brevo disclosed a SAML SSO boundary flaw that granted an attacker access to 138 customer accounts (6 used to send phishing; 43 had contacts exported). Vendor claims the entry point closed at 08:30 UTC the same day. Customer notifications were still publishing on 2026-09-13. Current confirmed compromise remains HOLD; it is not treated as a historical waived incident.

Covered operations (not admitted):

- `healthcheck`: `GET /v3/account`
- `contacts.list`: `GET /v3/contacts` with optional `limit` (1–1000), `offset`, `sort`, `modifiedSince`, `createdSince`
- `contacts.get`: `GET /v3/contacts/{identifier}` with optional `identifierType`
- `folders.list`: `GET /v3/contacts/folders` with optional `limit` (1–50), `offset`, `sort`
- `lists.list`: `GET /v3/contacts/lists` with optional `limit` (1–50), `offset`, `sort`

Contact/list mutations are omitted. Native category is `email-marketing` (source Communication/Marketing are not in the Rust CATEGORIES allowlist).

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://developers.brevo.com/reference/get-account. Incident: https://status.brevo.com/incidents/01M266V1CZKJQNGZRNEGFD5CQE. Fixtures are independently derived and do not represent live provider access. Live authentication remains unverified.
