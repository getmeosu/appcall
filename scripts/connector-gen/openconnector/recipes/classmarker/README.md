# ClassMarker

**HOLD.** Official ClassMarker REST at `https://api.classmarker.com` authenticates every request with query `api_key`, a lowercase SHA256(`api_key` + `api_secret` + unix `timestamp`), and `timestamp` (5-minute window). Pinned OpenConnector signs with `sha256Hex`. Native templates cannot compute signatures. ClassMarker also returns HTTP 200 with `status=error` on failures; `bodyErrorPaths` cannot distinguish `error` from `ok` because both are non-empty strings. This recipe is not admitted.

Documented operations (not admitted) would GET:

- `healthcheck`: `/v1.json` (groups/links/tests catalog; pinned validator)
- `groups.results.list`: `/v1/groups/recent_results.json`
- `links.results.list`: `/v1/links/recent_results.json`
- `group-tests.results.list`: `/v1/groups/{groupId}/tests/{testId}/recent_results.json`
- `link-tests.results.list`: `/v1/links/{linkId}/tests/{testId}/recent_results.json`

Native category is `productivity` (source Data is not in the Rust CATEGORIES allowlist). Fixtures show the unsigned `api_key` query shape only.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://www.classmarker.com/online-testing/docs/api/. Fixtures are independently derived and do not represent live provider access.
