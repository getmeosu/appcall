import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { loadFixtureCases, runCandidateFixtures } from "../../../../scripts/connector-gen/openconnector/recipe-fixtures";
import manifest from "../manifest.json";

type Op = { kind: string; sideEffect?: string; description?: string; effectPolicy?: string; reconcile?: string;
  requiredScopes?: string[]; request?: { method: string; path: string; body?: { query?: string }; baseUrl?: string } };
const ops = manifest.operations as unknown as Record<string, Op>;

const REMOVED = ["checkouts.create", "checkouts.get", "checkouts.update", "checkouts.complete",
  "checkouts.shipping-rates", "payments.create", "payments.get"];
const CHARGES = ["application-charges.create", "recurring-application-charges.create",
  "recurring-application-charges.customize", "usage-charges.create", "app-subscriptions.create",
  "app-subscriptions.update-line-item", "refunds.create", "transactions.create"];

const LISTING_WRITES = ["product-listings.update", "product-listings.delete",
  "collection-listings.update", "collection-listings.delete"];

describe("shopify SH-0 correctness", () => {
  test("version 0.4.2 with 468 ops; Checkout API ops (shut down 2025-04-01) removed", () => {
    expect(manifest.version).toBe("0.4.2");
    expect(Object.keys(ops)).toHaveLength(468);
    for (const k of REMOVED) expect(ops[k]).toBeUndefined();
    for (const op of Object.values(ops)) expect(op.request?.path ?? "").not.toMatch(/^\/checkouts\/\{\{/);
  });

  test("one Admin API version pin (2026-10) across declarative baseUrl, src and fixtures", () => {
    expect(manifest.http.baseUrl).toBe("https://{{shopDomain}}.myshopify.com/admin/api/2026-10");
    expect(JSON.stringify(manifest)).not.toContain("2026-07");
    const src = readFileSync(new URL("../src/http.ts", import.meta.url), "utf8");
    expect(src).toContain('SHOPIFY_API_VERSION = "2026-10"');
    const dir = new URL("../fixtures/cases/", import.meta.url).pathname;
    for (const f of readdirSync(dir)) expect(readFileSync(dir + f, "utf8")).not.toContain("/admin/api/2026-07/");
  });

  test("auth.scopes default connect set is unchanged", () => {
    expect(manifest.auth.scopes).toEqual(["read_products", "write_products", "read_orders", "write_orders",
      "read_customers", "write_customers", "read_inventory", "write_inventory"]);
  });

  test("GraphQL queries are read; mutations are never read", () => {
    for (const [k, op] of Object.entries(ops)) {
      const q = op.request?.path === "/graphql.json" ? (op.request.body?.query ?? "").trimStart() : "";
      if (q.startsWith("query")) expect(`${k}:${op.sideEffect}`).toBe(`${k}:read`);
      if (q.startsWith("mutation")) expect(`${k}:${op.sideEffect}`).not.toBe(`${k}:read`);
    }
  });

  test("deletes are destructive and carry no effect keys", () => {
    const destructive = Object.entries(ops).filter(([, op]) => op.sideEffect === "destructive").map(([k]) => k);
    expect(destructive).toHaveLength(52);
    for (const [k, op] of Object.entries(ops)) {
      if (op.request?.method === "DELETE") expect(`${k}:${op.sideEffect}`).toBe(`${k}:destructive`);
      if (op.sideEffect === "destructive") {
        expect(op.effectPolicy).toBeUndefined();
        expect(op.reconcile).toBeUndefined();
      }
    }
    for (const k of ["products.delete", "metafields.delete-by-identifier", "metaobjects.delete",
      "metaobjects.bulk-delete", "metaobject-definitions.delete", "customer-addresses.bulk-destroy", "gift-cards.disable"])
      expect(ops[k].sideEffect).toBe("destructive");
  });

  test("charges-money ops say so", () => {
    for (const k of CHARGES) {
      expect(ops[k].sideEffect).toBe("write");
      expect(ops[k].description).toStartWith("Charges money:");
      expect(ops[k].description).toContain("Fixtures-only");
    }
    const labelled = Object.entries(ops).filter(([, op]) => (op.description ?? "").startsWith("Charges money:")).map(([k]) => k);
    expect(labelled.sort()).toEqual([...CHARGES].sort());
  });

  test("requiredScopes are Shopify access scopes matching the op's side effect", () => {
    let n = 0;
    for (const [k, op] of Object.entries(ops)) {
      if (!op.requiredScopes) continue;
      n++;
      expect(op.kind).not.toBe("webhook");
      for (const s of op.requiredScopes) {
        expect(s).toMatch(/^(read|write)_[a-z_]+$/);
        // SH-0b: product_listings has only a read scope, which also covers its writes.
        if (op.sideEffect === "read" || LISTING_WRITES.includes(k)) expect(`${k}:${s}`).toStartWith(`${k}:read_`);
        else expect(`${k}:${s}`).toStartWith(`${k}:write_`);
      }
    }
    expect(n).toBe(277);
    expect(ops["products.get"].requiredScopes).toEqual(["read_products"]);
    expect(ops["payment-gateways.create"].requiredScopes).toEqual(["write_payment_gateways"]);
    expect(ops["apple-pay-certificates.get"].requiredScopes).toEqual(["read_mobile_payments"]);
  });

  test("doc cites use live 2026-10 slugs; deprecated REST ops are labelled; assigned fulfillment orders named", () => {
    const DEAD = ["abandoned-checkout", "access-scope", "apple-pay-certificate", "application-charge", "application-credit",
      "cancellation-request", "carrier-service", "collection-listing", "custom-collection", "deprecated-api-call", "discount-code",
      "draft-order", "fulfillment-event", "fulfillment-order", "fulfillment-service", "image", "inventory-item", "inventory-level",
      "locations-for-move", "marketing-event", "mobile-platform-application", "payment-gateway", "payment-transaction", "payout",
      "price-rule", "product-listing", "product-resource-feedback", "recurring-application-charge", "resource-feedback", "risk",
      "script-tag", "shipping-zone", "smart-collection", "storefront-access-token", "submitted-fulfillment-order",
      "tender-transaction", "usage-charge", "variant"];
    const text = JSON.stringify(manifest);
    for (const sl of DEAD) expect(text).not.toMatch(new RegExp(`admin-rest/2026-10/resources/${sl}(?=[."\\s])`));
    const labelled = Object.keys(ops).filter((k) => ops[k].description?.startsWith("Deprecated by Shopify"));
    expect(labelled).toHaveLength(26);
    for (const k of ["countries.list", "provinces.update", "risks.create", "comments.create", "discount-codes.lookup"]) expect(labelled).toContain(k);
    expect((ops["fulfillment-orders.list"] as { title?: string }).title).toContain("assigned fulfillment orders");
  });

  test("every fixture case replays and targets a declared op", async () => {
    const cases = loadFixtureCases(new URL("../fixtures/cases", import.meta.url).pathname);
    expect(cases).toHaveLength(402);
    const runs = await runCandidateFixtures(JSON.stringify(manifest), cases);
    expect(runs.filter((r) => r.status !== "passed").map((r) => `${r.caseId}:${r.error ?? ""}`)).toEqual([]);
    for (const c of cases) expect(ops[c.operation]).toBeDefined();
  }, 120_000);
});

describe("shopify SH-0b: product_listings scope remap", () => {
  test("no op references write_product_listings, and the string is absent from the manifest", () => {
    for (const [k, op] of Object.entries(ops)) expect(op.requiredScopes ?? [], k).not.toContain("write_product_listings");
    expect(readFileSync(new URL("../manifest.json", import.meta.url), "utf8")).not.toContain("write_product_listings");
  });

  test("the 4 listing writes require read_product_listings and cite the docs", () => {
    for (const k of LISTING_WRITES) {
      const op = ops[k]!;
      expect(op.requiredScopes, k).toEqual(["read_product_listings"]);
      expect(op.sideEffect, k).not.toBe("read");
      expect(op.description, k).toContain("https://shopify.dev/docs/api/usage/access-scopes");
      expect(op.description, k).toContain("Requires product_listings access scope");
      const page = k.startsWith("product-") ? "productlisting" : "collectionlisting";
      expect(op.description, k).toContain(`https://shopify.dev/docs/api/admin-rest/2026-10/resources/${page}`);
    }
  });

  test("every product_listings scope in the manifest is read_product_listings", () => {
    const listingScopes = Object.values(ops).flatMap((op) => op.requiredScopes ?? []).filter((s) => s.includes("product_listings"));
    expect(listingScopes.length).toBe(11);
    expect(new Set(listingScopes)).toEqual(new Set(["read_product_listings"]));
  });
});
