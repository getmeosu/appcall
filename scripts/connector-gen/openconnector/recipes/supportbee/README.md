# SupportBee

International SupportBee REST API recipe. Copy the API token from your SupportBee desk (profile picture → API Token) and set `company` to the desk subdomain from `https://<company>.supportbee.com`. The runner sends `Authorization: Bearer` and `Accept: application/json` to `https://<company>.supportbee.com`. Self-hosted or caller-supplied hosts are not admitted; the host is the stored company subdomain plus the bounded `*.supportbee.com` wildcard.

## Operations

- `healthcheck`
- `labels.list`
- `teams.list`
- `tickets.get`
- `tickets.list`
- `tickets.create`
- `tickets.search`
- `tickets.archive`
- `tickets.unarchive`
- `tickets.answered`
- `tickets.unanswered`
- `tickets.spam`
- `tickets.unspam`
- `tickets.trash`
- `tickets.untrash`
- `tickets.delete`
- `tickets.assign.team`
- `tickets.unassign.team`
- `tickets.unassign.user`
- `tickets.labels.add`
- `tickets.labels.remove`
- `replies.list`
- `replies.create`
- `replies.get`
- `comments.list`
- `comments.create`
- `users.list`
- `users.get`
- `users.create`
- `users.update`
- `snippets.list`
- `snippets.create`
- `snippets.update`
- `snippets.delete`
- `emails.list`
- `emails.create`
- `rules.create`
- `consequences.create`
- `filters.create`
- `reports.avg_first_response_time`
- `reports.tickets_count`
- `reports.replies_count`

All 41 Composio SUPPORTBEE_* HTTP tools are mapped. `healthcheck` is retained from origin/main. Native returns raw SupportBee JSON under `data`. 204 No Content routes return `{ data: { ok: true } }`. Native category is `productivity`.

## Adaptations

Pinned source and official docs agree on Bearer auth and `https://{company}.supportbee.com`. Filter rules use the official POST /rules fields (`requester_email`, `delivered_to`, `subject`, `body`) rather than Composio's invented `conditions`/`actions` arrays. Ticket create uses official `requester_email` / `requester_name` rather than a nested requester object.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://supportbee.com/docs/api/api and https://supportbee.com/docs/api/reference. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
