import { describe, test } from "bun:test";
import { expectPathFieldGuarded } from "../../_shared/test/path_segment_harness";

// SEC-PATH-2c: every (operation, path field) below reached the provider with a
// dot-only, empty or whitespace id before this fix (fuzzed on 6af924c2). Each
// must now be rejected before any request; percent-encoded dot forms must never
// arrive as a dot segment.
const CREDS = {"accessToken": "credaccessToken"};
const CASES: Array<[string, string]> = [
  ["associations.create", "fromId"],
  ["associations.create", "fromObjectType"],
  ["associations.create", "toId"],
  ["associations.create", "toObjectType"],
  ["companies.delete", "companyId"],
  ["companies.get", "companyId"],
  ["companies.update", "companyId"],
  ["contacts.delete", "contactId"],
  ["contacts.get", "contactId"],
  ["contacts.update", "contactId"],
  ["deals.delete", "dealId"],
  ["deals.get", "dealId"],
  ["deals.update", "dealId"],
  ["tickets.get", "ticketId"],
  ["tickets.update", "ticketId"],
];

describe("hubspot SEC-PATH-2c path ids", () => {
  for (const [action, field] of CASES) {
    test(`${action} ${field} rejects dot-only/blank before fetch`, async () => {
      await expectPathFieldGuarded("hubspot", action, field, CREDS);
    });
  }
});
