import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

const existing = ["healthcheck", "subscribers.list", "subscribers.get", "groups.list", "fields.list"] as const;
const webhooks = [
  "webhook.subscriber_created",
  "webhook.subscriber_updated",
  "webhook.subscriber_unsubscribed",
  "webhook.subscriber_added_to_group",
  "webhook.campaign_sent",
] as const;

describe("mailerlite manifest", () => {
  it("keeps existing keys and EventOnly webhooks at v0.2.0", () => {
    expect(manifest.key).toBe("mailerlite");
    expect(manifest.version).toBe("0.2.0");
    for (const key of existing) {
      expect(manifest.operations[key].kind).toBe("action");
      expect(manifest.operations[key].request).toBeTruthy();
    }
    for (const key of webhooks) {
      expect(manifest.operations[key]).toEqual({
        kind: "webhook",
        timeoutMs: 30000,
        maxInputBytes: 1048576,
        maxResponseBytes: 1048576,
      });
    }
  });
});
