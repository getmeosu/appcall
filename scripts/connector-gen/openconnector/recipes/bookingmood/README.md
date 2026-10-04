# Bookingmood

Bookingmood API v1 recipe at `https://api.bookingmood.com/v1`. This is the managed Amsterdam Cloud API documented by Bookingmood, not a caller-supplied host.

## Setup

Create an API key from the organization settings page in the Bookingmood admin dashboard. Store it as `apiKey`. Requests send `Authorization: Bearer` and `Accept: application/json`.

## Operations

Read, write, search, book, and EventOnly webhook operations for products, bookings, availability, organizations, sites, contacts, invoices, calendar events, webhooks, and booking details. Existing keys `healthcheck`, `products.list`, `bookings.list`, and `availability.get` are unchanged.

Successful action responses are raw provider JSON under AppCall `data`. Incoming vendor events are declared as `kind: webhook` EventOnly operations.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
