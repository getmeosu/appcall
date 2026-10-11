import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { QUICKBOOKS_ACTION_KEYS } from "../src/actions";

describe("quickbooks connector manifest", () => {
  test("manifest declares key, runtime, and auth", () => {
    expect(manifest.key).toBe("quickbooks");
    expect(manifest.name).toBe("QuickBooks Online");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.version).toBe("0.3.0");
    expect(manifest.auth.type).toBe("oauth2");
    expect(Object.keys(manifest.auth).sort()).toEqual(["scopes", "setup", "type"]);
    expect(manifest.auth.scopes).toContain("com.intuit.quickbooks.accounting");
    expect(manifest.auth.scopes).toContain("com.intuit.quickbooks.payment");
    expect(manifest.auth.setup.fields.some((field) => field.key === "realmId" && field.required)).toBe(true);
    expect(manifest.http.baseUrl).toBe("https://quickbooks.api.intuit.com/v3/company");
    expect(manifest.http.auth.value).toBe("Bearer {{accessToken}}");
    expect(manifest.http.headers["Content-Type"]).toBeUndefined();
    expect(manifest.provenance.source.revision).toBe("33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a");
  });

  test("manifest declares network controls", () => {
    expect(manifest.network.allowedHosts).toContain("quickbooks.api.intuit.com");
    expect(manifest.network.allowedHosts).toContain("api.intuit.com");
    expect(manifest.network.allowedHosts).toContain("appcenter.intuit.com");
    expect(manifest.network.allowedHosts).toContain("oauth.platform.intuit.com");
  });

  test("manifest declares sync and action operations", () => {
    expect(manifest.operations["invoices.list"].kind).toBe("sync");
    expect(manifest.operations["customers.list"].kind).toBe("sync");
    expect(manifest.operations["payments.list"].kind).toBe("sync");
    expect(manifest.operations["healthcheck"].kind).toBe("action");
    expect(manifest.operations["healthcheck"].sideEffect).toBe("read");
    expect(QUICKBOOKS_ACTION_KEYS).toHaveLength(114);
    expect(Object.keys(manifest.operations)).toHaveLength(118);
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

  test("every Composio QuickBooks tool is named in an action description", () => {
    const descriptions = QUICKBOOKS_ACTION_KEYS.map((key) => {
      const spec = (manifest.operations as Record<string, { description?: string }>)[key];
      return spec.description ?? "";
    }).join("\n");
    const slugs = descriptions.match(/QUICKBOOKS_[A-Z0-9_]+/g) ?? [];
    expect(new Set(slugs).size).toBe(114);
  });
});
