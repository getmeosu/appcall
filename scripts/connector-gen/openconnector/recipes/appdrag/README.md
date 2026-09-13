# AppDrag

**HOLD.** Official AppDrag Cloud Backend exposes only caller-defined `/api/{folder}/{function}` routes. Pinned credential validation is format-only and makes no HTTP call. There is no cheap authenticated account/list read; invoking a function is billed (`billedTime`) and may have side effects. APIKey is a query parameter on GET and a JSON body field on POST. Native templates cannot switch auth placement by method or compute environment-prefixed routes. Official product sunset is 2026-11-01. This recipe is not admitted.

Documented operations (not admitted):

- `healthcheck`: no official cheap authenticated probe exists
- `functions.execute`: `POST /api/{folder}/{functionName}` with `APIKey` in the JSON body

Environment-prefixed routes (`/dev/api/...`) and GET query-auth are omitted. Native category is `dev-tools` (source Developer Tools/Data).

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://support.appdrag.com/doc/Authentication-and-Access-Control and https://support.appdrag.com/doc/Sunset-of-AppDrag. Fixtures are independently derived and do not represent live provider access.
