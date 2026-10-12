import { describe, test } from "bun:test";
import { expectPathFieldGuarded } from "../../_shared/test/path_segment_harness";

// SEC-PATH-2c: every (operation, path field) below reached the provider with a
// dot-only, empty or whitespace id before this fix (fuzzed on 6af924c2). Each
// must now be rejected before any request; percent-encoded dot forms must never
// arrive as a dot segment.
const CREDS = {"accessToken": "t", "phoneNumberId": "1234567", "graphVersion": "v25.0"};
const CASES: Array<[string, string]> = [
  ["flows.updateJson", "flowId"],
  ["media.delete", "mediaId"],
  ["media.get", "mediaId"],
  ["messages.get", "messageId"],
  ["templates.list", "wabaId"],
];

describe("whatsapp SEC-PATH-2c path ids", () => {
  for (const [action, field] of CASES) {
    test(`${action} ${field} rejects dot-only/blank before fetch`, async () => {
      await expectPathFieldGuarded("whatsapp", action, field, CREDS);
    });
  }
});
