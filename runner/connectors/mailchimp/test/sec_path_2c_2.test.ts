import { describe, expect, test } from "bun:test";
import { outcomeOf, tryBaseline } from "../../_shared/test/path_segment_harness";
import manifest from "../manifest.json";
import { assertMailchimpHost } from "../src/host";

// SEC-PATH-2c-2: the `host` setup field renders https://{{host}}/3.0 and is also
// substituted into the outbound allowlist, so before this fix '.', '..' and
// 'a.evil.example' chose the request host. It must now be
// <label>.api.mailchimp.com with an RFC 1123 data-center label (assertHostLabel,
// same as zendesk subdomain / workable account); anything else is rejected with
// INVALID_ACTION_INPUT before any request. The hand-written handlers do not read
// `host` (their client derives <dc>.api.mailchimp.com from the API key, or runs
// the same check when a host is passed), so for them the invariant is that no
// request ever leaves <label>.api.mailchimp.com.
const CREDS = { apiKey: "key-us1" };
const BAD = [
  ".", "..", " . ", "", " ", "%2e", "a.evil.example", "evil.example", "api.mailchimp.com", ".api.mailchimp.com",
  "us1.api.mailchimp.com.evil", "us1.evil.api.mailchimp.com", "-us1.api.mailchimp.com", "us_1.api.mailchimp.com",
  "https://us1.api.mailchimp.com", "us1.api.mailchimp.com/3.0", "us1.api.mailchimp.com:8443", "user@us1.api.mailchimp.com",
  `${"a".repeat(64)}.api.mailchimp.com`,
];
const OPS: Array<[string, Record<string, unknown>]> = [
  ["account-exports.list", {}],
  ["activity-feed.list", {}],
];
const HAND_WRITTEN: Array<[string, Record<string, unknown>]> = [
  ["lists.get", { listId: "l1" }],
  ["templates.list", {}],
];
const MAILCHIMP_HOST = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.api\.mailchimp\.com$/;

describe("mailchimp SEC-PATH-2c-2 host setup field", () => {
  for (const [op, extra] of OPS) {
    test(`${op} accepts <dc>.api.mailchimp.com, case-insensitively`, async () => {
      for (const [value, host] of [["us1.api.mailchimp.com", "us1.api.mailchimp.com"], ["US6.API.Mailchimp.com", "us6.api.mailchimp.com"], [" us21.api.mailchimp.com ", "us21.api.mailchimp.com"]]) {
        const result = await outcomeOf("mailchimp", op, { ...CREDS, ...extra, host: value });
        expect(result.calls.length, `${op} ${value}: ${result.code} ${result.message}`).toBeGreaterThan(0);
        expect(new URL(result.calls[0]!.url).hostname).toBe(host);
      }
    });
    test(`${op} rejects any other host with 0 fetches`, async () => {
      for (const value of BAD) {
        const result = await outcomeOf("mailchimp", op, { ...CREDS, ...extra, host: value });
        expect(result.calls, `${op} host=${JSON.stringify(value)}`).toEqual([]);
        expect(result.ok).toBe(false);
        expect(result.code, `${op} host=${JSON.stringify(value)}`).toBe("INVALID_ACTION_INPUT");
        expect(result.message).toMatch(/^host /);
      }
    });
  }

  test("assertMailchimpHost (shared by the declarative guard and the hand-written client)", () => {
    for (const value of BAD) {
      expect(() => assertMailchimpHost(value), JSON.stringify(value)).toThrow();
      try { assertMailchimpHost(value); } catch (error) { expect((error as { code?: string }).code).toBe("INVALID_ACTION_INPUT"); }
    }
    expect(assertMailchimpHost("US3.api.mailchimp.com")).toBe("us3.api.mailchimp.com");
    expect(assertMailchimpHost(" us21.api.mailchimp.com ")).toBe("us21.api.mailchimp.com");
  });

  // Hand-written handlers do not read `host`; under the other test files'
  // module mocks they may not fetch at all, so only the host invariant applies.
  for (const [op, extra] of HAND_WRITTEN) {
    test(`${op} (hand-written) never sends to the supplied host`, async () => {
      for (const value of BAD) {
        const result = await outcomeOf("mailchimp", op, { ...CREDS, ...extra, host: value });
        for (const call of result.calls) expect(new URL(call.url).hostname, `${op} host=${JSON.stringify(value)}`).toMatch(MAILCHIMP_HOST);
      }
    });
  }

  test("every manifest action: the host never leaves <label>.api.mailchimp.com", async () => {
    const actions = Object.entries(manifest.operations as Record<string, { kind?: string }>)
      .filter(([op, spec]) => (spec.kind ?? "action") === "action" && op !== "healthcheck");
    expect(actions.length).toBeGreaterThan(300);
    let reached = 0;
    let guarded = 0;
    for (const [op] of actions) {
      const base = await tryBaseline("mailchimp", op, { ...CREDS, host: "us9.api.mailchimp.com" });
      if (!base) continue;
      reached++;
      const declarative = base.calls.some((call) => new URL(call.url).hostname === "us9.api.mailchimp.com");
      if (declarative) guarded++;
      for (const value of [".", "..", "a.evil.example", "us1.api.mailchimp.com.evil", "evil.example/x"]) {
        const result = await outcomeOf("mailchimp", op, { ...base.input, host: value });
        for (const call of result.calls) expect(new URL(call.url).hostname, `${op} host=${value}`).toMatch(MAILCHIMP_HOST);
        if (declarative) {
          expect(result.calls, `${op} host=${value}`).toEqual([]);
          expect(result.code, `${op} host=${value}`).toBe("INVALID_ACTION_INPUT");
        }
      }
    }
    expect(reached).toBeGreaterThan(250);
    expect(guarded).toBeGreaterThan(250);
  });
});
