import { describe, expect, test } from "bun:test";
import { outcomeOf } from "../../_shared/test/path_segment_harness";
import manifest from "../manifest.json";

// SEC-PATH-2c-2: the subdomain credential is the leftmost label of
// https://{subdomain}.zendesk.com. Before this fix the declarative operations
// rendered "." to https://..zendesk.com and "acme.evil" to an extra label; the
// hand-written ones already used an RFC 1123 check. Every path now rejects
// invalid labels with INVALID_ACTION_INPUT before any request.
const CREDS = { email: "agent@example.com", apiToken: "tok" };
const BAD = [".", "..", " . ", "", " ", "%2e", "%2E%2E", "-acme", "acme-", "a_b", "acme.evil", "acme.evil.com", "a b", "a".repeat(64)];
const OPS: Array<[string, Record<string, unknown>, "action" | "healthcheck"]> = [
  ["tickets.list", {}, "action"],
  ["tickets.get", { ticket_id: 5 }, "action"],
  ["tickets.tags.delete", { ticket_id: 5 }, "action"],
  ["tickets.tags.delete", { ticket_id: 5, tags: "a,b" }, "action"],
  ["healthcheck", {}, "healthcheck"],
];

describe("zendesk SEC-PATH-2c-2 subdomain host label", () => {
  for (const [op, extra, kind] of OPS) {
    test(`${op}${extra.tags ? " (hand-written)" : ""} accepts a label, case-insensitively`, async () => {
      for (const [value, host] of [["acme", "acme.zendesk.com"], ["ACME", "acme.zendesk.com"], ["a1-b2", "a1-b2.zendesk.com"], ["a".repeat(63), `${"a".repeat(63)}.zendesk.com`]]) {
        const result = await outcomeOf("zendesk", op, { ...CREDS, ...extra, subdomain: value }, kind);
        expect(result.calls.length, `${op} ${value}: ${result.code} ${result.message}`).toBeGreaterThan(0);
        expect(new URL(result.calls[0]!.url).hostname).toBe(host);
      }
    });
    test(`${op}${extra.tags ? " (hand-written)" : ""} rejects invalid labels with 0 fetches`, async () => {
      for (const value of BAD) {
        const result = await outcomeOf("zendesk", op, { ...CREDS, ...extra, subdomain: value }, kind);
        expect(result.calls, `${op} subdomain=${JSON.stringify(value)}`).toEqual([]);
        expect(result.ok).toBe(false);
        expect(result.code, `${op} subdomain=${JSON.stringify(value)}`).toBe("INVALID_ACTION_INPUT");
        expect(result.message).toMatch(/^subdomain /);
      }
    });
  }

  test("a missing subdomain with a credential is rejected, not sent to https://.zendesk.com", async () => {
    const result = await outcomeOf("zendesk", "tickets.list", { ...CREDS });
    expect(result.calls).toEqual([]);
    expect(result.code).toBe("INVALID_ACTION_INPUT");
    expect(result.message).toBe("subdomain is required");
  });

  test("every manifest action is behind the guard", async () => {
    const actions = Object.entries(manifest.operations as Record<string, { kind?: string }>).filter(([, spec]) => spec.kind === "action");
    expect(actions.length).toBeGreaterThan(10);
    for (const [op] of actions) {
      for (const value of [".", "acme.evil"]) {
        const result = await outcomeOf("zendesk", op, { ...{ ...CREDS }, subdomain: value });
        expect(result.calls, `${op} subdomain=${value}`).toEqual([]);
        expect(result.code, `${op} subdomain=${value}`).toBe("INVALID_ACTION_INPUT");
      }
    }
  });
});
