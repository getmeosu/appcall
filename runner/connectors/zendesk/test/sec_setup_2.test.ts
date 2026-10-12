import { describe, expect, test } from "bun:test";
import { outcomeOf } from "../../_shared/test/path_segment_harness";

// SEC-SETUP-2 (item 3): the subdomain accepts https:// and the full host.
const CREDS = { email: "agent@example.com", apiToken: "tok" };
const GOOD = ["acme", "https://acme", "acme.zendesk.com", "https://ACME.zendesk.com/", "acme/"];
const BAD = ["http://acme", "acme.evil.com", "acme.zendesk.com.evil.com", "acme.zendesk.com/x", "https://"];
const OPS: Array<[string, Record<string, unknown>, "action" | "healthcheck"]> = [
  ["tickets.list", {}, "action"],
  ["tickets.tags.delete", { ticket_id: 5, tags: "a,b" }, "action"],
  ["healthcheck", {}, "healthcheck"],
];

describe("zendesk SEC-SETUP-2 subdomain spellings", () => {
  for (const [op, extra, kind] of OPS) {
    test(`${op} normalizes https:// and the full host`, async () => {
      for (const value of GOOD) {
        const result = await outcomeOf("zendesk", op, { ...CREDS, ...extra, subdomain: value }, kind);
        expect(result.calls.length, `${op} ${value}`).toBeGreaterThan(0);
        expect(new URL(result.calls[0]!.url).hostname).toBe("acme.zendesk.com");
      }
    });
    test(`${op} still rejects other shapes with 0 fetches`, async () => {
      for (const value of BAD) {
        const result = await outcomeOf("zendesk", op, { ...CREDS, ...extra, subdomain: value }, kind);
        expect({ value, calls: result.calls.length, ok: result.ok }).toEqual({ value, calls: 0, ok: false });
      }
    });
  }
});
