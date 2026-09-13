# Browserless

**HOLD.** Official international Browserless Cloud REST at `https://production-sfo.browserless.io` (Browserless, United States). Configure an API token from the Browserless dashboard. The runner would send `?token=` plus `Cache-Control: no-cache`.

Pinned OpenConnector hardcodes the official Cloud SFO host; it does not accept a caller-supplied URL. Self-hosted Enterprise (container host, default `localhost:3000`) is a different edition and is not this recipe, so the Algolia stored-id + bounded-wildcard HOLD does not apply to the pinned cloud host.

The HOLD is billable-only healthcheck and non-JSON responses. The pinned credential validator is `POST /content` with `url=https://example.com`, which launches Chromium and consumes units. Official `GET /proxy/cities` is not a pinned upstream action and cannot be fabricated. Pinned `fetch_content` returns `text/html`; `take_screenshot` and `generate_pdf` return binary transit files the native JSON contract cannot express.

Covered operation (not admitted): `content.fetch` (`POST /content` with required `url`). Screenshot, PDF, scrape, function, and wait/script-injection options are omitted.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.browserless.io/rest-apis/content and https://docs.browserless.io/open-api/overview. Fixtures are independently derived placeholders and do not represent live provider access. Live authentication remains unverified.
