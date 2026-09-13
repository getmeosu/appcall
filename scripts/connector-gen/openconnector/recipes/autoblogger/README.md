# Autoblogging.ai

**HOLD.** Autoblogging.ai exposes only `POST https://dash.autoblogging.ai/api/v1/articles`. `create_article` is a billed write (base 1 credit, plus optional extras). `fetch_article` requires a caller-supplied `url_token`. The pinned credential validator POSTs a dummy article ID (`oomol-connect-validation`) and treats HTTP 404 as success unless the body looks like an invalid API key or email. Native healthcheck requires HTTP 2xx and cannot express 404-as-success. There is no cheap credential-only authenticated read.

Documented operations (not admitted) would send `dashboard_email` and `api_key` in the JSON body:

- `healthcheck` / `articles.get`: `POST /articles` with `request_type=fetch_article` and `url_token`

`create_article` is omitted. Native category is `productivity` (source Marketing/Design & Media are not in the Rust CATEGORIES allowlist). Operator is Autoblogging.ai in Surat, India; this is the global API edition, not a mainland-China product.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://autoblogging.ai/api-documentation/. Fixtures are independently derived and do not represent live provider access. This recipe is not admitted.
