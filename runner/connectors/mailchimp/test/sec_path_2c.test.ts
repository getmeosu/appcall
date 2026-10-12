import { describe, mock, test } from "bun:test";
import * as httpModule from "../src/http";
import { expectPathFieldGuarded } from "../../_shared/test/path_segment_harness";

// Other mailchimp test files mock.module("../src/http") with a fake client that
// never calls fetch, and Bun module mocks persist across files. Install a client
// that forwards every request path to globalThis.fetch so the harness sees it.
mock.module("../src/http", () => ({
  ...httpModule,
  createMailchimpClient: () => ({
    fetchJSON: async (path: string, init: RequestInit = {}) => {
      await globalThis.fetch(`https://us1.api.mailchimp.com/3.0${path}`, init);
      return { status: 200, headers: {} as Record<string, string>, body: {} };
    },
  }),
}));

// SEC-PATH-2c: every (operation, path field) below reached the provider with a
// dot-only, empty or whitespace id before this fix (fuzzed on 6af924c2). Each
// must now be rejected before any request; percent-encoded dot forms must never
// arrive as a dot segment.
const CREDS = {"apiKey": "key-us1"};
const CASES: Array<[string, string]> = [
  ["automations.get", "automationId"],
  ["campaigns.delete", "campaignId"],
  ["campaigns.get", "campaignId"],
  ["campaigns.replicate", "campaignId"],
  ["campaigns.schedule", "campaignId"],
  ["campaigns.send", "campaignId"],
  ["campaigns.unschedule", "campaignId"],
  ["contacts.create", "listId"],
  ["lists.delete", "listId"],
  ["lists.get", "listId"],
  ["lists.members.delete", "listId"],
  ["lists.members.get", "listId"],
  ["lists.members.tags.add", "listId"],
  ["lists.members.update", "listId"],
  ["lists.members.upsert", "listId"],
  ["lists.update", "listId"],
  ["members.notes.create", "listId"],
  ["reports.clicks", "campaignId"],
  ["reports.opens", "campaignId"],
  ["reports.summary", "campaignId"],
  ["reports.unsubscribed", "campaignId"],
  ["templates.get", "templateId"],
];

describe("mailchimp SEC-PATH-2c path ids", () => {
  for (const [action, field] of CASES) {
    test(`${action} ${field} rejects dot-only/blank before fetch`, async () => {
      await expectPathFieldGuarded("mailchimp", action, field, CREDS);
    });
  }
});
