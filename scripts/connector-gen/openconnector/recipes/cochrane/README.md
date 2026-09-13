# Cochrane

**HOLD.** Official Cochrane Archie Review Document API accepts HTTP Basic or Bearer OAuth2 access tokens. Pinned OpenConnector switches on a custom `authMethod` field. Native `http.auth` cannot express that switch, and native oauth is not supported for this provider shape. The pinned credential validator is `GET /rest/reviews?myRole=Author&published=false` with `Accept: application/xml`; native JSON cannot consume that XML list, and every JSON operation requires a `reviewId`. This recipe is not admitted.

Documented operations (not admitted) would talk to `https://archie.cochrane.org`:

- `healthcheck` / `reviews.metadata.get`: `GET /rest/reviews/{reviewId}/metadata`
- `reviews.versions.list`: `GET /rest/reviews/{reviewId}/versions`
- `reviews.roles.get`: `GET /rest/reviews/{reviewId}/roles`
- `reviews.translations.list`: `GET /rest/reviews/{reviewId}/translations`

Native category is `productivity` (source Data/Productivity). Archie is documented as retiring with the Archive API; this edition is the pinned Archie host only. Bearer in the native shape is a placeholder, not an admission of OAuth.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://documentation.cochrane.org/spaces/API/pages/117377312/Review+Document+API. Fixtures are independently derived and do not represent live provider access.
