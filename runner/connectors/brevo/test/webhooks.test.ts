import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";

const WEBHOOK_OPS = [
  "webhook.email.delivered",
  "webhook.email.opened",
  "webhook.email.clicked",
  "webhook.email.hard_bounce",
  "webhook.email.unsubscribed",
  "webhook.contact.updated",
  "webhook.list.addition",
] as const;

describe("brevo webhook operations", () => {
  test("omits unsupported EventOnly webhook placeholders", () => {
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    for (const key of WEBHOOK_OPS) expect(ops[key]).toBeUndefined();
    expect(Object.values(ops).filter((spec) => spec.kind === "webhook")).toEqual([]);
  });
});
