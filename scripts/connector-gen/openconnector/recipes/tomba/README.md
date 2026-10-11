# Tomba

International **Tomba Email Intelligence API** recipe covering origin healthcheck plus every Composio `TOMBA_*` HTTP tool (25 tools, 26 operations including `healthcheck`).

Generate an API key and secret at [app.tomba.io/api](https://app.tomba.io/api) and store them as `apiKey` and `apiSecret`. Requests send `X-Tomba-Key`, `X-Tomba-Secret`, and `Accept: application/json` to `https://api.tomba.io/v1`.

## Operations

- `healthcheck`: `GET /me` (origin credential probe; not a Composio tool).
- Finder: `domain.search`, `email.finder`, `author.finder`, `linkedin.finder`, `emails.count`, `email.format`, `employees.locations`.
- Verifier: `email.verifier`, `emails.verify_bulk` (`POST /bulk/verifier` with `launch: true`).
- Enrichment: `person.enrich`, `company.enrich`, `combined.enrich`.
- Phone: `phone.finder`, `phone.validate`.
- Domain / email helpers: `domain.status`, `email.sources`.
- Leads: `leads.create`, `leads.list`, `lists.list`, `lists.update`, `lists.delete`, `attributes.list`.
- Account: `usage.get`, `keys.list`, `keys.delete`.

Origin `email.finder` still requires `domain`, `firstName`, and `lastName` (wired as `first_name` / `last_name`). Origin `domain.search` still requires `domain`. Optional Composio fields (`company`, `full_name`, `enrich_mobile`, `limit`, `department`, `country`) are omitted when unset.

`leads.create` maps Composio `website` → official `website_url` and `phone` → `phone_number`. `emails.verify_bulk` creates and launches a bulk verifier job; it does not poll, download, or delete the job locally. `timeout_seconds` is accepted for Composio input compatibility and is not sent.

Successful responses are raw Tomba JSON under AppCall `data`. No inbound webhook ops (Composio triggers = 0). Similar-domain and Reveal search are omitted because they are not Composio tools.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
