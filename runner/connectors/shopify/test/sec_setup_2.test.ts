import { describe, expect, test } from "bun:test";
import { outcomeOf } from "../../_shared/test/path_segment_harness";
import { normalizeShopDomain } from "../src/http";

// SEC-SETUP-2 (item 1): only a leading https:// is stripped; http:// is refused.
describe("shopify SEC-SETUP-2 shopDomain scheme", () => {
  test("http:// spellings are refused before any request", async () => {
    for (const value of ["http://acme", "http://acme.myshopify.com", "HTTP://acme.myshopify.com/"]) {
      expect(() => normalizeShopDomain(value)).toThrow();
      const result = await outcomeOf("shopify", "products.get", { accessToken: "t", shopDomain: value, productId: 1 });
      expect({ value, calls: result.calls.length, ok: result.ok }).toEqual({ value, calls: 0, ok: false });
    }
  });
  test("https:// spellings still normalize", () => {
    for (const value of ["https://acme", "HTTPS://acme.myshopify.com/"]) expect(normalizeShopDomain(value)).toBe("acme");
  });
});
