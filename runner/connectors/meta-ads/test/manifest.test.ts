import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

describe("meta-ads manifest", () => {
  it("has correct key and version", () => {
    expect(manifest.key).toBe("meta-ads");
    expect(manifest.version).toBe("0.1.0");
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

  it("has all expected sync operations", () => {
    const ops = Object.keys(manifest.operations);
    expect(ops).toContain("campaigns.list");
    expect(ops).toContain("ad_sets.list");
    expect(ops).toContain("ads.list");
    expect(ops).toContain("ad_accounts.list");
  });

  it("has healthcheck operation", () => {
    expect(manifest.operations).toHaveProperty("healthcheck");
    expect((manifest.operations as any).healthcheck.kind).toBe("action");
  });

  it("has correct models", () => {
    expect(manifest.models).toEqual(["campaign", "ad_set", "ad", "ad_account"]);
  });
});
