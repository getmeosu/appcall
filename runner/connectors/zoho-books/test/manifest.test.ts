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
    expect(ops).toHaveLength(942);
    expect(manifest.operations["journals.delete-documents"].request.path).toBe(
      "/journals/{{journal_id}}/documents/{{document_id}}",
    );
    expect(manifest.operations["reporting-tags.list-all"].request.path).toBe(
      "/reportingtags/{{tag_id}}/options/all",
    );
    expect(manifest.operations["reporting-tags.create-active-2"].request.path).toBe(
      "/reportingtags/{{tag_id}}/option/{{option_id}}/active",
    );
    expect(manifest.operations["reporting-tags.create-inactive-2"].request.path).toBe(
      "/reportingtags/{{tag_id}}/option/{{option_id}}/inactive",
    );
    const handwritten = new Set([
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
      "healthcheck",
    ]);
    const syncs = new Set(["invoices.list", "contacts.list", "payments.list"]);
    for (const key of ops) {
      const op = manifest.operations[key as keyof typeof manifest.operations] as {
        kind?: string;
        request?: { method?: string; path?: string };
      };
      if (syncs.has(key)) {
        expect(op.kind).toBe("sync");
        expect(op.request).toBeUndefined();
        continue;
      }
      if (handwritten.has(key)) {
        expect(op.request).toBeUndefined();
        continue;
      }
      expect(op.kind).toBe("action");
      expect(typeof op.request?.method).toBe("string");
      expect(op.request?.method?.length).toBeGreaterThan(0);
      expect(typeof op.request?.path).toBe("string");
      expect(op.request?.path?.length).toBeGreaterThan(0);
    }
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
