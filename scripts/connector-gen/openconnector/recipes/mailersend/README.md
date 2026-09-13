# MailerSend

This recipe targets the international MailerSend API at `https://api.mailersend.com`.

## Setup

Create a sending-domain API token in the MailerSend dashboard under API Tokens and provide it as the `apiKey` secret. Requests use `Authorization: Bearer <apiKey>`.

## Selected operations

- `healthcheck`: credential-only `GET /v1/domains?limit=10`; input is `{}`.
- `domains.list`: read domains with optional `page` (minimum 1) and `limit` (10-100). Pagination is caller controlled. The connector preserves MailerSend's raw `data`, `links`, and `meta` JSON under the AppCall provider-data wrapper and never follows provider links automatically.

Domain objects use the documented `is_verified` boolean. Fixture responses are synthetic, nonempty examples shaped from the provider response. They prove request construction, validation, and response preservation only; live authentication remains unverified.

## Sources and security notes

Source implementation is pinned to [`oomol-lab/open-connector`](https://github.com/oomol-lab/open-connector) revision `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`.

Primary references: [Domains API](https://developers.mailersend.com/api/v1/email/domains), [general API and authentication](https://developers.mailersend.com/general), and [API token management](https://developers.mailersend.com/api/v1/account/tokens). Company/security sources reviewed 2026-09-13: [security statement](https://www.mailersend.com/legal/security-statement), [data processing addendum](https://www.mailersend.com/legal/data-processing-addendum), and [credential-leak remediation guide](https://developers.mailersend.com/guides/remediation-of-credential-leaks-api-token-and-smtp). These sources describe controls and remediation guidance; they do not establish a breach-free status.
