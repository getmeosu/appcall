# Gem

International **Gem** recruiting CRM API v0 at [api.gem.com](https://api.gem.com/v0/reference). This is Gem recruiting CRM, not Greenhouse and not Gem.co crypto.

## Setup

Store the team API key as `apiKey`. Requests send `X-API-Key` to `https://api.gem.com`. Hosts are bounded to `api.gem.com`.

## Operations

HTTP actions cover users, candidates, notes, projects (including membership), sequences, and custom fields. Gem CRM does not expose a first-party outbound webhook catalog, so this recipe has no EventOnly webhook ops.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
