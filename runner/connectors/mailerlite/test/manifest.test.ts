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
  it("keeps executable action keys and omits EventOnly webhooks at v0.2.0", () => {
    expect(manifest.key).toBe("mailerlite");
    expect(manifest.version).toBe("0.2.0");
    for (const key of existing) {
      expect(manifest.operations[key].kind).toBe("action");
      expect(manifest.operations[key].request).toBeTruthy();
    }
    for (const key of webhooks) expect(manifest.operations[key]).toBeUndefined();
    expect(Object.values(manifest.operations).filter((spec) => spec.kind === "webhook")).toEqual([]);
  });
});
