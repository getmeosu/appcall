import { describe, test } from "bun:test";
import { expectPathFieldGuarded } from "../../_shared/test/path_segment_harness";

// SEC-PATH-2c: every (operation, path field) below reached the provider with a
// dot-only, empty or whitespace id before this fix (fuzzed on 6af924c2). Each
// must now be rejected before any request; percent-encoded dot forms must never
// arrive as a dot segment.
const CREDS = {"accessToken": "credaccessToken", "apiKey": "credapiKey"};
const CASES: Array<[string, string]> = [
  ["campaigns.get", "campaignId"],
  ["campaigns.update", "campaignId"],
  ["catalog.items.get", "itemId"],
  ["events.get", "eventId"],
  ["events.relationships.get", "id"],
  ["lists.get", "listId"],
  ["metrics.get", "metricId"],
  ["profiles.addToList", "listId"],
  ["profiles.delete", "profileId"],
  ["profiles.get", "profileId"],
  ["profiles.relationships.get", "id"],
  ["profiles.removeFromList", "listId"],
  ["profiles.update", "profileId"],
  ["segments.get", "segmentId"],
  ["segments.relationships.get", "id"],
  ["tags.relationships.create", "id"],
  ["tags.relationships.delete", "id"],
  ["tags.relationships.get", "id"],
  ["templates.get", "templateId"],
];

describe("klaviyo SEC-PATH-2c path ids", () => {
  for (const [action, field] of CASES) {
    test(`${action} ${field} rejects dot-only/blank before fetch`, async () => {
      await expectPathFieldGuarded("klaviyo", action, field, CREDS);
    });
  }
});
