# Amilia

International Amilia organization API v3 recipe. Store the JWT as `apiKey` and the organization identifier as `organization`. Requests send `Authorization: Bearer` to `https://app.amilia.com/api/v3/en/org/{organization}`.

## Operations

Covers programs, activities, accounts, persons, locations, memberships, events, registrations, staff, and webhook subscriptions, plus EventOnly inbound webhooks for program, registration, account, person, activity, and facility-booking events.

Partner APIs and the authenticate mint call remain omitted. Successful responses are raw provider JSON under AppCall `data`.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://app.amilia.com/apidocs/ApiDocs/v3org.html. Fixtures are independently derived. Live smoke is unverified.
