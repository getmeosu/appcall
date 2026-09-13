# EmailOctopus

This recipe targets the international EmailOctopus API, owned and operated by Three Hearts Digital Ltd, a London company. The upstream Open Connector source is pinned to `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`.

## Setup

Create an API key in EmailOctopus, then store it in the AppCall credential setup field `apiKey` as a secret. Do not add `api_key` to operation input; AppCall appends the credential query parameter exactly once.

## Operations and pagination

- `healthcheck` calls `GET https://emailoctopus.com/api/1.6/lists` with `limit=1&page=1` and accepts `{}`.
- `lists.list` calls the same endpoint with bounded `limit` (1–100) and `page` (1+). The documented response has a `data` list array, each list's `counts.pending`, `counts.subscribed`, and `counts.unsubscribed`, plus `paging.previous` and `paging.next`. Pagination is caller controlled; AppCall returns provider links and never follows arbitrary next URLs.

Primary reference: https://emailoctopus.com/api-documentation/lists/get-all. Non-200 responses use `{code, message}`, including documented `API_KEY_INVALID` and `UNAUTHORISED` codes.

## Evidence status

Fixtures are supplied contract fixtures used by the provider-specific catalog build. Live authentication and live provider behavior remain unverified. Security coverage was bounded and dated 2026-09-13 using the API reference, https://emailoctopus.com/legal/privacy, and https://emailoctopus.com/legal/terms. No breach-free claim is made.
