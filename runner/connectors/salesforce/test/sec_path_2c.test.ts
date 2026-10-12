import { describe, expect, test } from "bun:test";
import { expectPathFieldGuarded, expectRejectedWithoutFetch, requestsFor } from "../../_shared/test/path_segment_harness";

// SEC-PATH-2c: every (operation, path field) below reached the provider with a
// dot-only, empty or whitespace id before this fix (fuzzed on 6af924c2). Each
// must now be rejected before any request; percent-encoded dot forms must never
// arrive as a dot segment.
const CREDS = {"accessToken": "t", "instanceUrl": "https://acme.my.salesforce.com", "instance_host": "acme.my.salesforce.com"};
const CASES: Array<[string, string]> = [
  ["accounts.delete", "id"],
  ["accounts.get", "id"],
  ["accounts.update", "id"],
  ["cases.delete", "id"],
  ["cases.get", "id"],
  ["cases.update", "id"],
  ["contacts.delete", "id"],
  ["contacts.get", "id"],
  ["contacts.update", "id"],
  ["leads.delete", "id"],
  ["leads.update", "id"],
  ["opportunities.delete", "id"],
  ["opportunities.get", "id"],
  ["opportunities.update", "id"],
  ["sobjects.describe", "sobject"],
];

describe("salesforce SEC-PATH-2c path ids", () => {
  for (const [action, field] of CASES) {
    test(`${action} ${field} rejects dot-only/blank before fetch`, async () => {
      await expectPathFieldGuarded("salesforce", action, field, CREDS);
    });
  }
});

describe("salesforce strict id / sobject guard", () => {
  const creds = { accessToken: "t", instanceUrl: "https://acme.my.salesforce.com" };
  test("percent-encoded dot forms are rejected outright", async () => {
    for (const bad of ["%2e%2e", "%2E", ".%2e", "001/../x"]) {
      await expectRejectedWithoutFetch("salesforce", "accounts.get", { ...creds, id: bad });
      await expectRejectedWithoutFetch("salesforce", "sobjects.describe", { ...creds, sobject: bad });
    }
  });
  test("record ids and custom sObject names keep working", async () => {
    expect(new URL((await requestsFor("salesforce", "accounts.get", { ...creds, id: "001xx000003DGb2AAG" }))[0]!.url).pathname).toMatch(/\/sobjects\/Account\/001xx000003DGb2AAG$/);
    expect(new URL((await requestsFor("salesforce", "sobjects.describe", { ...creds, sobject: "Invoice__c" }))[0]!.url).pathname).toMatch(/\/sobjects\/Invoice__c\/describe$/);
  });
});
