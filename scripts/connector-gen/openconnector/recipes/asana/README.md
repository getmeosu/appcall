# Asana recipe evidence

This prepared recipe retains the pinned OpenConnector source evidence and its
`HOLD` catalog-admission status. The existing recipe catalog extractor reads
`src/providers/asana/actions.ts`; the pinned source splits those definitions
across `actions-*.ts`, so the recipe cannot safely claim source-ID admission
until that extractor is corrected and independently reviewed.

The operation inventory and embedded manifest have been synchronized with the
prepared AppCall connector (203 operations, version 0.4.0). New operations were
authored from the official [Asana REST API reference](https://developers.asana.com/reference/rest-api-reference).
They are REST request declarations; the pinned OpenConnector code was not
copied into the runner. Fixture data is synthetic and does not establish live
provider behavior.

The provider uses Bearer authentication for personal access tokens and OAuth
access tokens. Credential setup uses the `apiToken` secret field. Composio's
ASANA toolkit is the comparison catalog, not an implementation source.
