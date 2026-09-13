# TalentLMS

Read-only international **TalentLMS API v2** recipe for hosted portals on `*.talentlms.com`. TalentLMS is the LMS operated by Epignosis. Enable the API under Account & Settings → Integrations → API, store the key as `apiKey`, and store the portal subdomain (the `{slug}` in `{slug}.talentlms.com`) as `domain`. Requests send `X-API-Key` and `X-API-Version: 2025-07-01` to `https://<domain>.talentlms.com/api/v2`. Custom CNAME hosts and caller-supplied full URLs are not admitted.

## Operations

- `healthcheck`: `GET /health` (pinned credential-validation probe).
- `users.list`: `GET /users` with optional `pageNumber` (>=1) and `pageSize` (1–100).
- `users.get`: `GET /users/{userId}`; `userId` is a required positive integer.
- `courses.list`: `GET /courses` with optional `pageNumber` and `pageSize`.
- `courses.get`: `GET /courses/{courseId}`; `courseId` is a required positive integer.

Successful responses are raw TalentLMS JSON under AppCall `data`. Pagination is caller controlled; `links.next` is not followed. User writes and deletes are omitted.

## Adaptations

Pinned source accepted `samples` or `samples.talentlms.com` as the domain value. Native requires the subdomain label only plus `allowedHosts: ["*.talentlms.com"]`. Official public API overview does not list `GET /health`; native follows the pinned `health_check` action. Native category is `productivity`. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://developers.talentlms.io/api/talentlms-public-api. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
