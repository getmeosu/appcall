# ContactOut

International **ContactOut REST API** recipe covering origin healthcheck plus every Composio `CONTACTOUT_*` HTTP tool (25 tools, 29 operations). `healthcheck` is an authenticated `GET /v1/stats` probe and is not a Composio slug. Origin LinkedIn contact checkers (`people.linkedin.personal-email-status`, `people.linkedin.work-email-status`, `people.linkedin.phone-status`) are kept alongside the combined Composio availability tool.

Request an API token from ContactOut and store it as `apiKey`. Requests send `token`, the documented literal `authorization: basic` header, and `Accept: application/json` to `https://api.contactout.com`. JSON writes also send `Content-Type: application/json`.

## Operations

- Auth / usage: `healthcheck`, `stats.get` (`GET /v1/stats`).
- LinkedIn contact checkers: `people.linkedin.personal-email-status`, `people.linkedin.work-email-status`, `people.linkedin.phone-status`, `people.linkedin.contact-availability` (`GET /v1/people/linkedin/{contact_type}_status`).
- Profile / contact: `linkedin.enrich`, `people.linkedin.get`, `people.linkedin.batch`, `people.linkedin.batch.create`, `people.linkedin.batch.job.get`, `people.person.get`, `email.enrich`, `people.enrich`, `people.identifiers`.
- Search: `people.search`, `people.count`, `people.decision-makers`, `companies.search`, `companies.domain.enrich`.
- Email verifier: `email.verify`, `email.verify.batch.create`, `email.verify.batch.get`.
- Campaigns: `campaigns.list`, `campaigns.get`, `campaigns.recipients.add`, `campaigns.recipients.remove`, `campaigns.start`, `campaigns.stop`.

Successful responses are raw provider JSON under AppCall `data`. Optional query and JSON body fields are omitted when unset. `people.linkedin.contact-availability` interpolates Composio `contact_type` (`personal_email` | `work_email` | `phone`) into the official checker path. Campaign recipient removal is `DELETE` with a JSON body as documented. The upstream user-agent is not sent.

Source attribution: [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://api.contactout.io/. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
