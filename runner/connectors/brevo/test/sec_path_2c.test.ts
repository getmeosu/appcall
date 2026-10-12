import { describe, test } from "bun:test";
import { expectPathFieldGuarded } from "../../_shared/test/path_segment_harness";

// SEC-PATH-2c: every (operation, path field) below reached the provider with a
// dot-only, empty or whitespace id before this fix (fuzzed on 6af924c2). Each
// must now be rejected before any request; percent-encoded dot forms must never
// arrive as a dot segment.
const CREDS = {"apiKey": "k"};
const CASES: Array<[string, string]> = [
  ["companies.delete", "id"],
  ["companies.get", "id"],
  ["contacts.campaignStats.get", "identifier"],
  ["contacts.delete", "identifier"],
  ["contacts.get", "identifier"],
  ["contacts.update", "identifier"],
  ["crm.objects.records.list", "object_type"],
  ["smtp.templates.get", "template_id"],
];

describe("brevo SEC-PATH-2c path ids", () => {
  for (const [action, field] of CASES) {
    test(`${action} ${field} rejects dot-only/blank before fetch`, async () => {
      await expectPathFieldGuarded("brevo", action, field, CREDS);
    });
  }
});
