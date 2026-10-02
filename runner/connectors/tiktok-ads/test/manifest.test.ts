import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

describe("tiktok-ads manifest", () => {
  it("has correct key and version", () => {
    expect(manifest.key).toBe("tiktok-ads");
    expect(manifest.name).toBe("TikTok Ads");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.runtime).toBe("bun");
  });

  it("uses oauth2 auth with scopes", () => {
    expect(manifest.auth.type).toBe("oauth2");
    expect(manifest.auth.setup.mode).toBe("oauth2");
    expect(manifest.auth.scopes).toContain("ad.management");
    expect(manifest.auth.scopes).toContain("ad.read");
  });

  it("allows tiktok hosts", () => {
    expect(manifest.network.allowedHosts).toContain("business-api.tiktok.com");
    expect(manifest.network.allowedHosts).toHaveLength(1);
  });

  it("has all expected operations", () => {
    const ops = Object.keys(manifest.operations);
    expect(ops).toContain("campaigns.list");
    expect(ops).toContain("ad_groups.list");
    expect(ops).toContain("ads.list");
    expect(ops).toContain("analytics.report.get");
    expect(ops).toContain("advertisers.list");
    expect(ops).toContain("campaigns.get");
    expect(ops).toContain("ad_groups.get");
    expect(ops).toContain("ads.get");
    expect(ops).toContain("pixels.list");
    expect(ops).toContain("healthcheck");
    expect(ops).toHaveLength(10);
  });

  it("has correct operation kinds", () => {
    expect(manifest.operations["campaigns.list"].kind).toBe("sync");
    expect(manifest.operations["ad_groups.list"].kind).toBe("sync");
    expect(manifest.operations["ads.list"].kind).toBe("sync");
    expect(manifest.operations.healthcheck.kind).toBe("action");
  });

  it("new P0 ops are actions with schemas", () => {
    for (const key of [
      "analytics.report.get",
      "advertisers.list",
      "campaigns.get",
      "ad_groups.get",
      "ads.get",
      "pixels.list",
    ] as const) {
      const op = manifest.operations[key];
      expect(op.kind).toBe("action");
      expect(op.inputSchema).toBeDefined();
      expect(op.outputSchema).toBeDefined();
    }
  });

  it("has correct models", () => {
    expect(manifest.models).toEqual([
      "campaign",
      "ad_group",
      "ad",
      "advertiser",
      "pixel",
      "analytics_result",
    ]);
  });
});
