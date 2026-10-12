import { describe, expect, test } from "bun:test";
import { expectPathFieldGuarded, expectRejectedWithoutFetch, requestsFor } from "../../_shared/test/path_segment_harness";

// SEC-PATH-2c: every (operation, path field) below reached the provider with a
// dot-only, empty or whitespace id before this fix (fuzzed on 6af924c2). Each
// must now be rejected before any request; percent-encoded dot forms must never
// arrive as a dot segment.
const CREDS = {"accessToken": "credaccessToken"};
const CASES: Array<[string, string]> = [
  ["bills.get", "billId"],
  ["contacts.delete", "contactId"],
  ["contacts.get", "contactId"],
  ["contacts.update", "contactId"],
  ["invoices.email", "invoiceId"],
  ["invoices.get", "invoiceId"],
  ["invoices.update", "invoiceId"],
  ["invoices.void", "invoiceId"],
  ["items.get", "itemId"],
  ["organizations.get", "organizationId"],
];

describe("zoho-books SEC-PATH-2c path ids", () => {
  for (const [action, field] of CASES) {
    test(`${action} ${field} rejects dot-only/blank before fetch`, async () => {
      await expectPathFieldGuarded("zoho-books", action, field, CREDS);
    });
  }
});

describe("zoho-books organizations.get organizationId (beyond-13 empty collapse)", () => {
  test("a present but blank or dot-only organizationId never falls back to the list route", async () => {
    for (const organizationId of ["", " ", ".", "..", "%2e%2e", null]) {
      await expectRejectedWithoutFetch("zoho-books", "organizations.get", { accessToken: "t", organizationId });
    }
  });
  test("an omitted organizationId lists organizations; a real id gets its own path", async () => {
    expect(new URL((await requestsFor("zoho-books", "organizations.get", { accessToken: "t" }))[0]!.url).pathname).toBe("/api/v3/organizations");
    expect(new URL((await requestsFor("zoho-books", "organizations.get", { accessToken: "t", organizationId: "10234695" }))[0]!.url).pathname).toBe("/api/v3/organizations/10234695");
  });
});
