import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";

describe("quickbooks connector manifest", () => {
  test("manifest declares key, runtime, and auth", () => {
    expect(manifest.key).toBe("quickbooks");
    expect(manifest.name).toBe("QuickBooks Online");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.auth.type).toBe("oauth2");
    expect(manifest.auth.scopes).toContain("com.intuit.quickbooks.accounting");
  });

  test("manifest declares network controls", () => {
    expect(manifest.network.allowedHosts).toContain("quickbooks.api.intuit.com");
  });

  test("manifest declares sync and action operations", () => {
    expect(manifest.operations["invoices.list"].kind).toBe("sync");
    expect(manifest.operations["customers.list"].kind).toBe("sync");
    expect(manifest.operations["payments.list"].kind).toBe("sync");
    expect(manifest.operations["healthcheck"].kind).toBe("action");
  });

  test("manifest declares models", () => {
    expect(manifest.models).toContain("invoice");
    expect(manifest.models).toContain("customer");
    expect(manifest.models).toContain("payment");
  });

  test("manifest has timeout and size limits on all operations", () => {
    for (const [, spec] of Object.entries(manifest.operations)) {
      const s = spec as Record<string, unknown>;
      expect(typeof s.timeoutMs).toBe("number");
      expect((s.timeoutMs as number) > 0).toBe(true);
      expect(typeof s.maxInputBytes).toBe("number");
      expect(typeof s.maxResponseBytes).toBe("number");
    }
  });
});
