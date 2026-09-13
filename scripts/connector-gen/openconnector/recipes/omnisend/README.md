# Omnisend

This recipe targets the international Omnisend API at `https://api.omnisend.com/api`, using API version `2026-03-15`.

## Setup

Create an API key in the Omnisend application, then supply it as the recipe credential field `apiKey`. Requests send `Authorization: Omnisend-API-Key <apiKey>` and `Omnisend-Version: 2026-03-15`. Keep the key secret and rotate it through Omnisend when access changes.

## Operations

- `healthcheck`: read-only `GET /contacts?limit=1`, accepts `{}`.
- `contacts.list`: read-only `GET /contacts`, with `limit` from 1 through 250 and optional opaque `after` cursor.

Omnisend uses cursor pagination. Pass `paging.cursors.after` unchanged in the next request and stop when `paging.hasMore` is false or the cursor is null. The recipe never follows provider supplied URLs automatically.

The selected edition is the international Omnisend API and the pinned upstream source is `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Responses preserve the provider JSON under the AppCall provider data wrapper.

## Evidence

The supplied fixtures cover healthcheck, a contacts page requested with `limit=25` and a nondefault opaque cursor, null and out-of-range limits, and a 401 response. Fixture evidence is supplied; live authentication and live provider replay remain unverified.

Official references: [authentication](https://api-docs.omnisend.com/reference/authentication), [list contacts](https://api-docs.omnisend.com/reference/get_contacts), and [pagination](https://api-docs.omnisend.com/reference/pagination). Provider identity is documented on [Omnisend About Us](https://www.omnisend.com/about-us/), and security incident handling on the [Omnisend DPA](https://www.omnisend.com/data-processing-agreement/). The dated review also checked the [Omnisend status history](https://status.omnisend.com/history); no confirmed customer-data breach was identified in that bounded review, and this is not a breach-free claim.

Omnisend's upstream Open Connector implementation is attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) at the pinned revision.
