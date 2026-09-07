import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";

describe("google-ads connector manifest", () => {
  test("manifest declares key, runtime, and auth", () => {
    expect(manifest.key).toBe("google-ads");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.auth.type).toBe("oauth2");
    expect(manifest.auth.scopes).toContain("https://www.googleapis.com/auth/adwords");
  });

  test("manifest declares network controls", () => {
    expect(manifest.network.allowedHosts).toContain("googleads.googleapis.com");
  });

  test("manifest declares sync and action operations", () => {
    expect(manifest.operations["campaigns.list"].kind).toBe("sync");
    expect(manifest.operations["ad_groups.list"].kind).toBe("sync");
    expect(manifest.operations["ads.list"].kind).toBe("sync");
    expect(manifest.operations["healthcheck"].kind).toBe("action");
  });

  test("manifest declares models", () => {
    expect(manifest.models).toContain("campaign");
    expect(manifest.models).toContain("ad_group");
    expect(manifest.models).toContain("ad");
  });

  test("manifest has timeout and size limits on all operations", () => {
    for (const [op, spec] of Object.entries(manifest.operations)) {
      const s = spec as Record<string, unknown>;
      expect(typeof s.timeoutMs).toBe("number");
      expect((s.timeoutMs as number) > 0).toBe(true);
      expect(typeof s.maxInputBytes).toBe("number");
      expect(typeof s.maxResponseBytes).toBe("number");
    }
  });
});
