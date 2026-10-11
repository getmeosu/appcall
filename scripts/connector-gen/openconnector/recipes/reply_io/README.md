# Reply.io

International Reply.io API v3 recipe. Create or copy an API key in Settings → API Key (https://run.reply.io) and store it as `apiKey`. Requests send `Authorization: Bearer` and `Accept: application/json` to `https://api.reply.io`.

## Operations

- `healthcheck`: `GET /v3/whoami`
- `users.list`: `GET /v3/whoami/team-users`
- `contacts.list`: `GET /v3/contacts` with optional `top`, `skip`, and exact `email`
- `contacts.search`: `GET /v3/contacts` with required `email` (`REPLY_IO_SEARCH_CONTACTS`)
- `contacts.get`: `GET /v3/contacts/{id}`
- `contacts.create`: `POST /v3/contacts`
- `contacts.update`: `PATCH /v3/contacts/{id}`
- `contacts.delete`: `DELETE /v3/contacts/{id}` (204)
- `contacts.move_to_sequence`: `POST /v3/contacts/{id}/move-to-sequence` (204)
- `contacts.statuses`: `GET /v3/contacts/{id}/statuses`
- `contacts.set_status`: `POST /v3/contacts/set-status-in-sequence`
- `contacts.clear_opt_out`: `POST /v3/contacts/set-opted-out` with `isOptedOut: false`
- `sequences.list`: `GET /v3/sequences` with optional `top`, `skip`, and `name`
- `sequences.get`: `GET /v3/sequences/{id}`
- `sequences.start`: `POST /v3/sequences/{id}/start`
- `sequences.pause`: `POST /v3/sequences/{id}/pause`
- `sequences.archive`: `POST /v3/sequences/{id}/archive`
- `sequences.delete`: `DELETE /v3/sequences/{id}` (204)
- `sequences.steps.list`: `GET /v3/sequences/{id}/steps`
- `sequences.steps.create`: `POST /v3/sequences/{id}/steps`
- `sequences.steps.get`: `GET /v3/sequences/{id}/steps/{step_id}`
- `sequences.contacts.state`: `GET /v3/sequences/{id}/contacts/state`
- `sequences.contacts.remove`: `DELETE /v3/sequences/{id}/contact-links/{contact_id}` (204)
- `sequences.contacts.remove_bulk`: `POST /v3/sequences/{id}/contact-links/bulk-delete`
- `email_accounts.list`: `GET /v3/email-accounts`
- `email_accounts.connect_gmail`: `GET /v3/email-accounts/connect/gmail` (302 Location; overlay uses `redirect:manual`)
- `email_accounts.connect_office365`: `GET /v3/email-accounts/connect/office-365` (302 Location; overlay uses `redirect:manual`)
- `email_accounts.list_disconnected`: `POST /v3/email-accounts/filter` with `{status: disconnected}`
- `email_accounts.update`: `PATCH /v3/email-accounts/{id}`
- `email_accounts.delete`: `DELETE /v3/email-accounts/{id}` (204)
- `contact_lists.list`: `GET /v3/contact-lists`
- `schedules.delete`: `DELETE /v3/schedules/{id}` (204)
- `ulid.generate`: local Crockford ULID (`REPLY_IO_GENERATE_ULID`; no HTTP)

Successful JSON responses are raw provider payloads under AppCall `data`. Empty 204 bodies surface as `{data: null}`. CONNECT ops return `{data:{location}}` from the 302 Location header. `ulid.generate` has no request block.

## Holes

- `REPLY_IO_DELETE_USER` has no v3 delete-user path.

## Adaptations

Pinned source and official v3 docs agree on `https://api.reply.io`, Bearer auth, and `top`/`skip` query names (not `$top`/`$skip` or Composio `page`/`limit`). Native category is `crm`. Content-Type is omitted on GET and on empty-body POST start/pause/archive. Official 401 responses have an empty body. Field names follow OpenAPI (`linkedInUrl`, `timeZoneId`, lowercase step `type`, `variants`).

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
