import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

describe("linkedin-ads manifest", () => {
  it("has correct key and version", () => {
    expect(manifest.key).toBe("linkedin-ads");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.runtime).toBe("bun");
  });

  it("uses oauth2 auth with ad scopes", () => {
    expect(manifest.auth.type).toBe("oauth2");
    expect(manifest.auth.setup.mode).toBe("oauth2");
    expect(manifest.auth.scopes).toContain("r_ads");
    expect(manifest.auth.scopes).toContain("r_ads_reporting");
  });

  it("allows linkedin api host", () => {
    expect(manifest.network.allowedHosts).toContain("api.linkedin.com");
    expect(manifest.network.allowedHosts).toHaveLength(1);
  });

  it("has all expected operations", () => {
    const ops = Object.keys(manifest.operations);
    expect(ops).toContain("campaigns.list");
    expect(ops).toContain("ad_accounts.list");
    expect(ops).toContain("creative_assets.list");
    expect(ops).toContain("healthcheck");
  });

  it("sync operations have correct shape", () => {
    const campaigns = manifest.operations["campaigns.list"];
    expect(campaigns.kind).toBe("sync");
    expect(campaigns.timeoutMs).toBe(30000);
    expect(campaigns.maxInputBytes).toBe(65536);
    expect(campaigns.maxResponseBytes).toBe(5242880);

    const accounts = manifest.operations["ad_accounts.list"];
    expect(accounts.kind).toBe("sync");

    const creatives = manifest.operations["creative_assets.list"];
    expect(creatives.kind).toBe("sync");
  });

  it("healthcheck is an action with short timeout", () => {
    const hc = manifest.operations["healthcheck"];
    expect(hc.kind).toBe("action");
    expect(hc.timeoutMs).toBe(5000);
    expect(hc.maxInputBytes).toBe(4096);
    expect(hc.maxResponseBytes).toBe(65536);
  });

  it("has correct models", () => {
    expect(manifest.models).toEqual(["campaign", "ad_account", "creative_asset"]);
  });
});
