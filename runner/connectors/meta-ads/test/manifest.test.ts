import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

describe("meta-ads manifest", () => {
  it("has correct key and version", () => {
    expect(manifest.key).toBe("meta-ads");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.runtime).toBe("bun");
  });

  it("uses oauth2 auth with correct scopes", () => {
    expect(manifest.auth.type).toBe("oauth2");
    expect(manifest.auth.setup.mode).toBe("oauth2");
    expect(manifest.auth.scopes).toContain("ads_management");
    expect(manifest.auth.scopes).toContain("ads_read");
    expect(manifest.auth.scopes).toContain("read_insights");
  });

  it("allows graph.facebook.com host", () => {
    expect(manifest.network.allowedHosts).toContain("graph.facebook.com");
  });

  it("has tip sync operations", () => {
    const ops = Object.keys(manifest.operations);
    expect(ops).toContain("campaigns.list");
    expect(ops).toContain("ad_sets.list");
    expect(ops).toContain("ads.list");
    expect(ops).toContain("ad_accounts.list");
  });

  it("has G1 action operations (15) and totals 20", () => {
    const ops = Object.keys(manifest.operations);
    expect(ops).toHaveLength(20);
    for (const id of [
      "campaigns.get",
      "campaigns.create",
      "campaigns.update",
      "ad_sets.get",
      "ad_sets.create",
      "ad_sets.update",
      "ads.get",
      "ads.create",
      "ads.update",
      "ad_creatives.list",
      "ad_creatives.get",
      "ad_creatives.create",
      "insights.get",
      "ad_accounts.get",
      "targeting.search",
    ]) {
      expect(ops).toContain(id);
      expect((manifest.operations as any)[id].kind).toBe("action");
    }
  });

  it("applies effect rules: creates omit, updates Reconcile, never Idempotent", () => {
    const ops = manifest.operations as Record<string, any>;
    expect(ops["campaigns.create"].effectPolicy).toBeUndefined();
    expect(ops["ad_sets.create"].effectPolicy).toBeUndefined();
    expect(ops["ads.create"].effectPolicy).toBeUndefined();
    expect(ops["ad_creatives.create"].effectPolicy).toBeUndefined();
    expect(ops["campaigns.update"].effectPolicy).toBe("Reconcile");
    expect(ops["campaigns.update"].reconcile).toBe("campaigns.get");
    expect(ops["ad_sets.update"].effectPolicy).toBe("Reconcile");
    expect(ops["ad_sets.update"].reconcile).toBe("ad_sets.get");
    expect(ops["ads.update"].effectPolicy).toBe("Reconcile");
    expect(ops["ads.update"].reconcile).toBe("ads.get");
    expect(ops["ads.update"].inputSchema.properties.bidAmount).toBeUndefined();
    const blob = JSON.stringify(manifest);
    expect(blob.includes("Idempotent")).toBe(false);
  });

  it("has healthcheck operation", () => {
    expect(manifest.operations).toHaveProperty("healthcheck");
    expect((manifest.operations as any).healthcheck.kind).toBe("action");
  });

  it("has correct models including ad_creative", () => {
    expect(manifest.models).toEqual(["campaign", "ad_set", "ad", "ad_account", "ad_creative"]);
  });
});
