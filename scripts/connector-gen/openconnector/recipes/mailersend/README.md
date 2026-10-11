# MailerSend

This recipe targets the international MailerSend API at `https://api.mailersend.com`.

## Setup

Create a sending-domain API token in the MailerSend dashboard under API Tokens and provide it as the `apiKey` secret. Requests use `Authorization: Bearer <apiKey>`.

## Selected operations

- `healthcheck`: credential-only `GET /v1/domains?limit=10`; input is `{}`.
- `domains.list`: read domains with optional `page` (minimum 1), `limit` (10-100), and `verified`.
- Composio MAILERSEND HTTP tools: domains, SMTP users, tokens, webhooks, API quota, sender identities, messages, recipients, templates, users, and SMS activity/inbounds/messages/numbers/recipients.
- `resources.general` is `GET /v1/domains?limit=10` because MailerSend has no catalog-of-endpoints API.
- `webhooks.delete` returns HTTP 204 and a static `{success: true}` envelope.
- Pagination is caller controlled. The connector preserves MailerSend's raw JSON under the AppCall provider-data wrapper and never follows provider links automatically.

Fixture responses are synthetic, nonempty examples shaped from the provider response. They prove request construction, validation, and response preservation only; live authentication remains unverified.

## Sources and security notes

Source implementation is pinned to [`oomol-lab/open-connector`](https://github.com/oomol-lab/open-connector) revision `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`.

Primary references: [Domains API](https://developers.mailersend.com/api/v1/email/domains), [Tokens](https://developers.mailersend.com/api/v1/account/tokens), [Webhooks](https://developers.mailersend.com/api/v1/account/webhooks), [API quota](https://developers.mailersend.com/guides/checking-api-quota), [general API](https://developers.mailersend.com/general). Company/security sources reviewed 2026-09-13: [security statement](https://www.mailersend.com/legal/security-statement), [data processing addendum](https://www.mailersend.com/legal/data-processing-addendum), and [credential-leak remediation](https://developers.mailersend.com/guides/remediation-of-credential-leaks-api-token-and-smtp). These sources describe controls and remediation guidance; they do not establish a breach-free status.
