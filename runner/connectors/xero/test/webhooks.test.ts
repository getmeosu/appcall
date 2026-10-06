import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";

const WEBHOOK_OPS = [
  "webhook.invoice.created",
  "webhook.invoice.updated",
  "webhook.contact.created",
  "webhook.contact.updated",
] as const;

describe("xero webhook operations", () => {
  test("omits unsupported EventOnly webhook placeholders", () => {
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    for (const key of WEBHOOK_OPS) expect(ops[key]).toBeUndefined();
    expect(Object.values(ops).filter((spec) => spec.kind === "webhook")).toEqual([]);
  });
});
