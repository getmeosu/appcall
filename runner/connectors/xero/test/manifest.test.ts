import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";

describe("xero connector manifest", () => {
  test("manifest declares key, runtime, and auth", () => {
    expect(manifest.key).toBe("xero");
    expect(manifest.name).toBe("Xero");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.auth.type).toBe("oauth2");
    expect(manifest.auth.scopes).toContain("accounting.transactions");
    expect(manifest.auth.scopes).toContain("accounting.contacts");
    expect(manifest.auth.scopes).toContain("offline_access");
  });

  test("manifest declares network controls", () => {
    expect(manifest.network.allowedHosts).toContain("api.xero.com");
  });

  test("manifest declares sync and action operations", () => {
    expect(manifest.operations["invoices.list"].kind).toBe("sync");
    expect(manifest.operations["contacts.list"].kind).toBe("sync");
    expect(manifest.operations["bank_transactions.list"].kind).toBe("sync");
    expect(manifest.operations["healthcheck"].kind).toBe("action");
  });

  test("manifest declares models", () => {
    expect(manifest.models).toContain("invoice");
    expect(manifest.models).toContain("contact");
    expect(manifest.models).toContain("bank_transaction");
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
