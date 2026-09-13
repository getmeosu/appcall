# Benchmark Email

**HOLD.** Official XMLAPI answers HTTP 200 with `Status: "-1"` on failure. Pinned OpenConnector treats that envelope as an error. Native `bodyErrorPaths` cannot use `Status` because success `Status: "1"` is also a non-empty string and would false-fail. `ErrorMessage`/`StatusText` are not documented as present on every XMLAPI error, so they are not guessed. This recipe is not admitted.

Documented operations (not admitted) would send `token` and `output=json` to `https://api.benchmarkemail.com/1.0`:

- `healthcheck`: XMLAPI `clientGetProfileDetails` (pinned credential validator)
- `account.summary.get`: `clientGetPlanInfo`
- `contacts.list`: `listGetFilteredContacts`
- `contact.get`: `listGetContactDetails`
- `lists.summary.get`: `listGet`

REST v3 (`clientapi.benchmarkemail.com`, `AuthToken`) and the newer `api.benchmarkemail.io` (`X-API-Key`) are different editions and are not allowlisted. Native category is `email-marketing` (source Marketing/Communication). The pinned extra `baseUrl` field is not exposed; the official XMLAPI host is used only so the recipe has a native shape.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://api.benchmarkemail.com/ and https://kb.benchmarkemail.com/en/how-do-i-access-the-benchmark-email-apis/. Fixtures are independently derived and do not represent live provider access.
