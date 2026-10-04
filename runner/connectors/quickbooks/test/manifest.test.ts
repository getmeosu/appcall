import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";

describe("quickbooks connector manifest", () => {
  test("manifest declares key, runtime, version, and oauth", () => {
    expect(manifest.key).toBe("quickbooks");
    expect(manifest.name).toBe("QuickBooks Online");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.auth.type).toBe("oauth2");
    expect(manifest.auth.scopes).toContain("com.intuit.quickbooks.accounting");
    expect(manifest.auth.oauth.authorizeUrl).toBe("https://appcenter.intuit.com/connect/oauth2");
    expect(manifest.auth.oauth.tokenUrl).toBe("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer");
    expect(manifest.auth.setup.fields).toEqual([
      expect.objectContaining({ key: "realmId", required: true, secret: false }),
    ]);
  });

  test("manifest declares network controls for API and OAuth hosts", () => {
    expect(manifest.network.allowedHosts).toEqual([
      "quickbooks.api.intuit.com",
      "appcenter.intuit.com",
      "oauth.platform.intuit.com",
    ]);
    expect(manifest.http.baseUrl).toBe("https://quickbooks.api.intuit.com/v3/company/{{realmId}}");
    expect(manifest.http.auth.field).toBe("accessToken");
  });

  test("keeps existing sync keys and adds real HTTP actions", () => {
    expect(manifest.operations["invoices.list"].kind).toBe("sync");
    expect(manifest.operations["customers.list"].kind).toBe("sync");
    expect(manifest.operations["payments.list"].kind).toBe("sync");
    expect(manifest.operations["healthcheck"].kind).toBe("action");
    expect(manifest.operations["healthcheck"].request.method).toBe("GET");
    expect(manifest.operations["customers.create"].request.method).toBe("POST");
    expect(Object.keys(manifest.operations).length).toBe(22);
  });

  test("manifest declares models", () => {
    expect(manifest.models).toEqual(expect.arrayContaining(["invoice", "customer", "payment", "vendor", "item", "bill", "estimate", "company"]));
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
