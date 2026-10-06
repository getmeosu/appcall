import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

describe("Zoho Books manifest", () => {
  it("has correct key", () => expect(manifest.key).toBe("zoho-books"));
  it("has version 0.3.0", () => expect(manifest.version).toBe("0.3.0"));
  it("uses bun runtime", () => expect(manifest.runtime).toBe("bun"));
  it("requires oauth2 auth", () => expect(manifest.auth.type).toBe("oauth2"));
  it("allows the legacy and official Zoho Books hosts", () =>
    expect(manifest.network.allowedHosts).toEqual(["books.zoho.com", "www.zohoapis.com"]));
  it("declares write scopes", () => {
    expect(manifest.auth.scopes).toContain("ZohoBooks.contacts.CREATE");
    expect(manifest.auth.scopes).toContain("ZohoBooks.invoices.CREATE");
    expect(manifest.auth.scopes).toContain("ZohoBooks.bills.CREATE");
  });
  it("declares depth-slice operations", () => {
    const ops = Object.keys(manifest.operations);
    for (const key of [
      "contacts.get",
      "contacts.create",
      "contacts.update",
      "contacts.delete",
      "invoices.get",
      "invoices.create",
      "invoices.update",
      "invoices.email",
      "invoices.void",
      "bills.list",
      "bills.get",
      "bills.create",
      "items.list",
      "items.get",
      "items.create",
      "organizations.get",
    ]) {
      expect(ops).toContain(key);
      const op = manifest.operations[key as keyof typeof manifest.operations];
      expect(op.kind).toBe("action");
      expect(op.inputSchema).toBeDefined();
      expect(op.title).toBeTruthy();
      expect(op.description).toBeTruthy();
    }
    expect(ops.length).toBeGreaterThan(20);
    expect(manifest.operations["invoices.list"].kind).toBe("sync");
    expect(manifest.operations["contacts.list"].kind).toBe("sync");
    expect(manifest.operations["payments.list"].kind).toBe("sync");
    expect(manifest.operations["invoices.list"].request).toBeUndefined();
  });
  it("declares models", () => {
    expect(manifest.models).toContain("invoice");
    expect(manifest.models).toContain("contact");
    expect(manifest.models).toContain("payment");
    expect(manifest.models).toContain("bill");
    expect(manifest.models).toContain("item");
    expect(manifest.models).toContain("organization");
  });
});
