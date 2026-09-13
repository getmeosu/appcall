# Worksnaps

**HOLD.** The official Worksnaps API is XML-only at `https://api.worksnaps.com/api` (`.xml` paths, `Accept: application/xml`, HTTP Basic with the API token as username). Native recipes require `responseFormat: json` and parse JSON. XML cannot be expressed without inventing a JSON dialect the provider does not document.

Documented operations (not admitted) would send Basic auth:

- `healthcheck`: `GET /me.xml` (pinned credential validator)
- `projects.list`: `GET /projects.xml`
- `projects.get`: `GET /projects/{projectId}.xml`
- `tasks.list`: `GET /projects/{projectId}/tasks.xml`

Time-entry reports, assignment lists, and writes are omitted. Native category is `productivity`. Pinned source sends Basic password literal `ignored`; official copy says the password is ignored.

CVE-2025-10560 (hardcoded AWS root credentials in client binaries) is a historical remediated issue (fixed 1.6.20260201; SEC Consult recheck 2026-01-30) and is not the HOLD reason.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://api.worksnaps.com/api_docs/worksnaps_api.html and https://api.worksnaps.com/api_docs/api_token.html. Fixtures are independently derived and do not represent live provider access.
