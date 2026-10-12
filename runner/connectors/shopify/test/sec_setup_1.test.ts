import { describe, expect, test } from "bun:test";
import { outcomeOf } from "../../_shared/test/path_segment_harness";
import { normalizeShopDomain } from "../src/http";

// SEC-SETUP-1: shopDomain is the leftmost label of <shop>.myshopify.com.
const BAD = [
  ".", "..", "", " ", "%2e", "a.evil.example", "evil.example/x", "a/b", "a\\b", "/", "a?b", "a#b", "a@b",
  "-shop", "shop-", "a_b", "acme:443", "acme.myshopify.com.evil.example", "evil.example#.myshopify.com", "https://",
];
const GOOD = ["acme", " acme ", "ACME", "acme.myshopify.com", "ACME.MyShopify.com", "https://acme.myshopify.com", "https://acme.myshopify.com/", "http://acme.myshopify.com", "acme/"];

describe("shopify shopDomain", () => {
  test("stored spellings normalize to one label", () => {
    for (const value of GOOD) expect(normalizeShopDomain(value)).toBe("acme");
  });
  test("bad spellings are refused before any request", async () => {
    for (const value of BAD) {
      expect(() => normalizeShopDomain(value)).toThrow();
      const result = await outcomeOf("shopify", "products.get", { accessToken: "t", shopDomain: value, productId: 1 });
      expect({ value, calls: result.calls.length, ok: result.ok }).toEqual({ value, calls: 0, ok: false });
    }
  });
  test("a good spelling reaches <shop>.myshopify.com", async () => {
    for (const value of GOOD) {
      const result = await outcomeOf("shopify", "products.get", { accessToken: "t", shopDomain: value, productId: 1 });
      expect(result.calls.map((c) => new URL(c.url).hostname)).toEqual(["acme.myshopify.com"]);
    }
  });
});
