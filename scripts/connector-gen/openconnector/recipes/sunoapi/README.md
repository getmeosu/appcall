# SunoAPI

**HOLD.** sunoapi.org is an unofficial third-party music-generation API. Official pages do not name a legal entity. English docs use `https://api.sunoapi.org`; the published OpenAPI server is `https://apibox.erweima.ai`. Third-party reporting associates the brand with kie.ai / NEXUSAI SERVICES LLC (Denver, Colorado) and with Chinese-language docs. Distinct from Suno, Inc. (`suno.com`). Unknown geography/edition/operator is HOLD.

HTTP 200 JSON envelopes use a numeric `code` (200 means success). `http.errors.bodyErrorPaths` treats any number as an error, so `code: 200` cannot be a success signal. Native cannot express `code !== 200`. This is a remaining operationQuality HOLD.

Documented operations (not admitted) would send `Authorization: Bearer` to `https://api.sunoapi.org`:

- `healthcheck`: `GET /api/v1/generate/credit`
- `music.generation.get`: `GET /api/v1/generate/record-info?taskId=`
- `lyrics.generation.get`: `GET /api/v1/lyrics/record-info?taskId=`
- `vocal-separation.get`: `GET /api/v1/vocal-removal/record-info?taskId=`

Music/lyrics/video generation POSTs and other writes are omitted. Native category is `utility` (source AI / Design & Media).

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://docs.sunoapi.org/suno-api/quickstart. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
