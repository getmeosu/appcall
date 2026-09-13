# Amilia

Read-only international Amilia organization API v3 recipe. Mint a one-year JWT with `GET https://app.amilia.com/api/V3/authenticate` using Basic auth for a dedicated API user, then store the token as `apiKey` and the organization number or URL identifier (for example `forest-explorers`) as `organization`. Requests send `Authorization: Bearer` to `https://app.amilia.com/api/v3/en/org/{organization}`.

## Operations

- `healthcheck`: `GET /programs?page=1&perPage=1` (cheap authenticated probe; pinned credential validator).
- `programs.list`: `GET /programs` with optional `showHidden`, `showArchived`, `page`, `perPage`.
- `programs.get`: `GET /programs/{programId}`; `programId` is required.
- `activities.list`: `GET /programs/{programId}/activities` with optional visibility/tax/page filters.
- `activities.get`: `GET /activities/{activityId}` with optional `showTaxes`.

Writes, partner APIs, and the authenticate mint call are omitted. Successful responses are raw provider JSON under AppCall `data`.

## Adaptations

Pinned definition says POST authenticate; official docs use GET authenticate with Basic. Native stores the JWT and does not call authenticate. Organization is a required stored path id on the fixed host `app.amilia.com`, not a caller-supplied host. Native category is `scheduling`. The recommended `X-Amilia-Origin` header and upstream user-agent are not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://app.amilia.com/apidocs/ and https://app.amilia.com/apidocs/ApiDocs/v3org.html. Fixtures are independently derived and do not represent live provider access. Live smoke is unverified.
