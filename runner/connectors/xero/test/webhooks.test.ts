import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";

const WEBHOOK_OPS = [
  "webhook.invoice.created",
  "webhook.invoice.updated",
  "webhook.contact.created",
  "webhook.contact.updated",
] as const;

describe("xero webhook operations", () => {
  test("declares EventOnly webhooks with sideEffect read", () => {
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    for (const key of WEBHOOK_OPS) {
      expect(ops[key].kind).toBe("webhook");
      expect(ops[key].sideEffect).toBe("read");
      expect(ops[key].title).toBeTruthy();
      expect(ops[key].description).toBeTruthy();
      expect((ops[key].inputSchema as { type: string }).type).toBe("object");
    }
  });
});
