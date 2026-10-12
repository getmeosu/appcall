import { describe, test } from "bun:test";
import { expectPathFieldGuarded } from "../../_shared/test/path_segment_harness";

// SEC-PATH-2c: every (operation, path field) below reached the provider with a
// dot-only, empty or whitespace id before this fix (fuzzed on 6af924c2). Each
// must now be rejected before any request; percent-encoded dot forms must never
// arrive as a dot segment.
const CREDS = {"apiKey": "re_key"};
const CASES: Array<[string, string]> = [
  ["domains.get", "id"],
  ["emails.get", "id"],
];

describe("resend SEC-PATH-2c path ids", () => {
  for (const [action, field] of CASES) {
    test(`${action} ${field} rejects dot-only/blank before fetch`, async () => {
      await expectPathFieldGuarded("resend", action, field, CREDS);
    });
  }
});

// SEC-PATH-2c recount: contacts.list segmentId / audienceId ' ' sent
// GET /segments/%20/contacts. Blank, whitespace and dot-only (padded too) scope
// ids are rejected with zero requests; a real id still scopes the list.
import { expect } from "bun:test";
import { BLANK, DOT_ONLY, PERCENT_DOTS, requestsFor } from "../../_shared/test/path_segment_harness";

describe("resend contacts.list scope id", () => {
  for (const field of ["segmentId", "audienceId"]) {
    test(`${field}: blank/whitespace/dot-only rejected before fetch`, async () => {
      for (const bad of [...BLANK, ...DOT_ONLY]) {
        expect(await requestsFor("resend", "contacts.list", { ...CREDS, [field]: bad }), `${field}=${JSON.stringify(bad)}`).toEqual([]);
      }
      const ok = await requestsFor("resend", "contacts.list", { ...CREDS, [field]: "seg_1" });
      expect(ok.map((call) => new URL(call.url).pathname)).toEqual(["/segments/seg_1/contacts"]);
      for (const bad of PERCENT_DOTS) {
        for (const call of await requestsFor("resend", "contacts.list", { ...CREDS, [field]: bad })) {
          const segment = new URL(call.url).pathname.split("/")[2]!;
          expect(decodeURIComponent(segment)).toBe(bad);
        }
      }
    });
  }
});
