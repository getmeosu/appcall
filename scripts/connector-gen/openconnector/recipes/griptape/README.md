# Griptape

International Griptape Cloud API recipe at `https://cloud.griptape.ai/api`.

## Setup

Create an API key in the Griptape Cloud console. Store it as `apiKey`. Requests send `Authorization: Bearer`.

## Operations

Organization, assistant, assistant-run, structure, structure-run, thread, bucket, knowledge-base, and ruleset HTTP actions. Existing keys `healthcheck`, `organizations.get`, `assistants.list`, `assistants.get`, and `assistant-runs.get` are unchanged. Griptape Cloud run events are streamed over the run APIs rather than inbound HTTP webhooks, so no EventOnly webhook operations are declared.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
