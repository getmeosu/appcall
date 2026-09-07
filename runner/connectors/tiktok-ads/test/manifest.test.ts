import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

describe("tiktok-ads manifest", () => {
  it("has correct key and version", () => {
    expect(manifest.key).toBe("tiktok-ads");
    expect(manifest.name).toBe("TikTok Ads");
    expect(manifest.version).toBe("0.1.0");
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
  });

  it("has all expected operations", () => {
    const ops = Object.keys(manifest.operations);
    expect(ops).toContain("campaigns.list");
    expect(ops).toContain("ad_groups.list");
    expect(ops).toContain("ads.list");
    expect(ops).toContain("healthcheck");
  });

  it("has correct operation kinds", () => {
    expect(manifest.operations["campaigns.list"].kind).toBe("sync");
    expect(manifest.operations["ad_groups.list"].kind).toBe("sync");
    expect(manifest.operations["ads.list"].kind).toBe("sync");
    expect(manifest.operations.healthcheck.kind).toBe("action");
  });

  it("has correct models", () => {
    expect(manifest.models).toEqual(["campaign", "ad_group", "ad"]);
  });
});
