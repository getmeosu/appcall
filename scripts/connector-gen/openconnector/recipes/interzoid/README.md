# Interzoid

Read-only Interzoid Cloud API recipe. Copy the API license key from the Interzoid account page and store it as `apiKey`. The runner sends it as the documented `license` query parameter to `https://api.interzoid.com` plus `Accept: application/json`.

## Operations

- `address.global_match`: `GET /getglobaladdressmatch?address=&algorithm=` — Generate an Interzoid similarity key for a global street address.
- `address.match`: `GET /getaddressmatchadvanced?address=&algorithm=` — Generate an Interzoid similarity key for a US street address.
- `address.parse`: `GET /addressparse?address=` — Parse a free-form US or global address into structured Interzoid components.
- `area_code.from_number`: `GET /getareacodefromnumber?number=` — Retrieve US telephone area-code geography from a phone number.
- `area_code.get`: `GET /getareacode?areacode=` — Retrieve primary city and locale information for a US telephone area code.
- `business.info`: `GET /getbusinessinfo?lookup=` — Retrieve Interzoid company profiles and business intelligence by name, domain, or email.
- `company.match`: `GET /getcompanymatchadvanced?algorithm=&company=` — Generate an Interzoid similarity key for a company name.
- `company.parent`: `GET /getparentcompanyinfo?lookup=` — Retrieve Interzoid ultimate parent company information for a company name or domain.
- `country.info`: `GET /getcountryinfo?country=&algorithm=` — Standardize a country name and return ISO codes, currency, TLD, and calling code.
- `credits.get`: `GET /getremainingcredits` — Retrieve remaining Interzoid API credits for the connected license key.
- `currency.rate`: `GET /getcurrencyrate?symbol=` — Retrieve the live USD exchange rate for a three-letter ISO 4217 currency.
- `custom.data`: `GET /getcustom?topic=&lookup=&output=&model=` — Retrieve Interzoid AI custom enrichment for a topic and lookup value.
- `email.info`: `GET /getemailinfo?email=` — Validate and enrich an email address with Interzoid.
- `email.trust`: `GET /emailtrustscore?lookup=` — Return an Interzoid trust score for an email address.
- `entity.type`: `GET /getentitytype?text=` — Classify a text string as a location, organization, individual, or other Interzoid entity type.
- `executive.profile`: `GET /getexecutiveprofile?lookup=` — Retrieve Interzoid executive profile details from company and title keywords.
- `fullname.match`: `GET /getfullnamematch?fullname=` — Generate an Interzoid similarity key for an individual full name.
- `fullname.match_score`: `GET /getfullnamematchscore?fullname1=&fullname2=` — Return an Interzoid similarity score between two full names.
- `healthcheck`: `GET /getremainingcredits` — Validate the Interzoid license key with GET /getremainingcredits.
- `ip.profile`: `GET /getipprofile?lookup=` — Retrieve Interzoid profile and reputation information for an IP address.
- `language.identify`: `GET /identifylanguage?text=` — Detect the language of a text string with Interzoid.
- `name.origin`: `GET /getnameorigin?name=` — Infer the likely country or region of origin from a personal name.
- `organization.match_score`: `GET /getorgmatchscore?org1=&org2=` — Return a 1–99 Interzoid match score between two organization names.
- `organization.standardize`: `GET /getorgstandard?org=` — Standardize an organization name using Interzoid.
- `page.global_load`: `GET /globalpageload?url=&origin=` — Measure page or API load time from a specified Interzoid global origin.
- `phone.profile`: `GET /getphoneprofile?lookup=` — Retrieve Interzoid phone intelligence including validation, carrier, and risk assessment.
- `product.match`: `GET /getproductmatch?product=&algorithm=` — Generate an Interzoid similarity key for a product name.
- `translate.to_any`: `GET /translatetoany?text=&to=` — Auto-detect the input language and translate text to a specified target language.
- `weather.global`: `GET /getglobalweather?location=` — Return current weather conditions for a worldwide location.
- `weather.zip`: `GET /getweatherzipcode?zip=` — Get current weather conditions for a US ZIP code.

`INTERZOID_GET_LICENSE` is omitted: it is a Composio connection-metadata helper that returns the configured API key, not an Interzoid HTTP endpoint.

## Adaptations

Pinned source and official docs agree on `license` query authentication at `api.interzoid.com`. Official also documents an `x-api-key` header variant; native does not send that header. Native category is `utility` (source Data/Developer Tools are not in the Rust CATEGORIES allowlist). Official JSON bodies include `Code` `Success`; native `bodyErrorPaths` use a non-empty `Message` because `Code=Success` would trip a string path. `algorithm` is any non-empty string because current official samples include `model-v3-wide` while pinned source enumerates `wide` / `narrow` / `model-v4-*`. `organization.match_score` maps Composio `company1`/`company2` onto documented `org1`/`org2`. `custom.data` sends `output` as a single string query parameter. `page.global_load` uses OpenAPI `GET /globalpageload` (not the later `/globallatency` marketing path).

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
