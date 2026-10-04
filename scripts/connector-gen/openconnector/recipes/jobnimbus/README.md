# JobNimbus

International **JobNimbus Open API** recipe for the contractor CRM at [jobnimbus.com](https://www.jobnimbus.com). This is the Open API at `https://app.jobnimbus.com/api1`, not the newer Platform API at `https://api.jobnimbus.com`.

## Setup

Create an API key in JobNimbus under Settings > API Keys and store it as `apiKey`. Requests send `Authorization: Bearer <apiKey>` and `Accept: application/json`.

## Operations

Contacts, jobs, tasks, activities, files, invoices, estimates, products, and work orders covering list/get plus contact/job/task/activity writes. Healthcheck remains `GET /contacts?size=1`. EventOnly webhooks: `webhook.contact_created`, `webhook.job_created`, `webhook.task_created`, `webhook.activity_created`.

Successful responses are raw provider JSON under AppCall `data`. Elasticsearch-style `filter` JSON encoding, `fields` comma-join, `actor`, and sort are omitted.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
