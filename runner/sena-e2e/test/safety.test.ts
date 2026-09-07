// runner/sena-e2e/test/safety.test.ts
import { test, expect } from "bun:test";
import { resolveSend } from "../safety";
import type { HarnessConfig } from "../config";

const base: HarnessConfig = {
  baseUrl: "http://localhost:5080", apiKey: "k", externalAccountId: "sena",
  capabilityProfile: "sena_mvt", sendMode: "dry_run",
  testRecipientEmail: "me@test.dev", testRecipientProfile: "https://linkedin.com/in/me",
  calendlyToken: "", calendlyEventType: "", maxLeads: 1, allowBulk: false,
  stateDir: "runner/sena-e2e/state",
};

test("dry_run never sends", () => {
  const r = resolveSend({ ...base, sendMode: "dry_run" }, "email", "lead@acme.com", { processedSends: 0 });
  expect(r.shouldSend).toBe(false);
});

test("live_single overrides the recipient to the email test target", () => {
  const r = resolveSend({ ...base, sendMode: "live_single" }, "email", "lead@acme.com", { processedSends: 0 });
  expect(r.shouldSend).toBe(true);
  expect(r.recipient).toBe("me@test.dev");
});

test("live_single overrides DM recipient to the profile test target", () => {
  const r = resolveSend({ ...base, sendMode: "live_single" }, "dm", "https://linkedin.com/in/lead", { processedSends: 0 });
  expect(r.shouldSend).toBe(true);
  expect(r.recipient).toBe("https://linkedin.com/in/me");
});

test("live_single refuses when its test target is empty", () => {
  expect(() => resolveSend({ ...base, sendMode: "live_single", testRecipientEmail: "" }, "email", "x@y.com", { processedSends: 0 })).toThrow();
});

test("live_bulk refuses without allowBulk", () => {
  expect(() => resolveSend({ ...base, sendMode: "live_bulk", allowBulk: false }, "email", "lead@acme.com", { processedSends: 0, priorEvidenceGreen: true })).toThrow();
});

test("live_bulk refuses without prior green evidence", () => {
  expect(() => resolveSend({ ...base, sendMode: "live_bulk", allowBulk: true }, "email", "lead@acme.com", { processedSends: 0, priorEvidenceGreen: false })).toThrow();
});

test("live_bulk sends to the real lead when gated and under cap", () => {
  const r = resolveSend({ ...base, sendMode: "live_bulk", allowBulk: true, maxLeads: 5 }, "email", "lead@acme.com", { processedSends: 2, priorEvidenceGreen: true });
  expect(r.shouldSend).toBe(true);
  expect(r.recipient).toBe("lead@acme.com");
});

test("live_bulk stops at the maxLeads cap", () => {
  const r = resolveSend({ ...base, sendMode: "live_bulk", allowBulk: true, maxLeads: 2 }, "email", "lead@acme.com", { processedSends: 2, priorEvidenceGreen: true });
  expect(r.shouldSend).toBe(false);
});
