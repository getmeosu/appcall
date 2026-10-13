import { expect, it } from "bun:test";
import manifest from "../manifest.json";

const originKeys = [
  "healthcheck",
  "bookings.list",
  "bookings.get",
  "bookings.create",
  "bookings.cancel",
  "cities.list",
  "cities.get",
  "categories.listByCity",
  "collections.listByCity",
  "subcategories.listByCity",
  "products.listByCity",
  "products.listByCategory",
  "products.listByCollection",
  "products.get",
  "inventory.listByVariant",
  "reviews.listByProduct",
];

const v2Routes = {
  HEADOUT_LIST_CATEGORIES_V2: "/api/public/v2/categories",
  HEADOUT_LIST_COLLECTIONS_V2: "/api/public/v2/collections",
  HEADOUT_LIST_PRODUCTS_V2: "/api/public/v2/products",
  HEADOUT_LIST_SUBCATEGORIES_V2: "/api/public/v2/subcategories",
};

it("declares bounded action schemas with titles and descriptions", () => {
  expect(manifest.version).toBe("0.2.1");
  expect(manifest.full_depth).toBeUndefined();
  expect(manifest.http?.baseUrl).toBe("https://www.headout.com/api/public/v1");
  expect(manifest.http?.auth).toEqual({
    field: "apiKey",
    in: "header",
    name: "Headout-Auth",
    value: "{{apiKey}}",
  });
  expect(manifest.network?.allowedHosts).toEqual(["www.headout.com"]);
  const ops = manifest.operations as Record<string, any>;
  expect(Object.keys(ops)).toEqual([...originKeys, ...Object.keys(v2Routes)]);
  for (const key of originKeys) {
    expect(ops[key].request?.baseUrl).toBeUndefined();
    expect(String(ops[key].request?.path ?? "")).not.toContain("/api/public/v2/");
  }
  for (const [key, path] of Object.entries(v2Routes)) {
    const op = ops[key];
    expect(op.request).toEqual({
      method: "GET",
      path,
      query: op.request.query,
      success: [200],
      baseUrl: "https://www.headout.com",
    });
    expect(op.request.body).toBeUndefined();
    expect(op.request.headers).toBeUndefined();
    expect(JSON.stringify(op.request)).not.toContain("Content-Type");
    expect(op.outputSchema.type).toBe("object");
    expect(op.sideEffect).toBe("read");
    expect(op.inputSchema.required).toEqual(["cityCode"]);
    expect(op.inputSchema.properties.languageCode.type).toBe("string");
  }
  expect(ops.HEADOUT_LIST_PRODUCTS_V2.inputSchema.properties).toMatchObject({
    cityCode: { type: "string" },
    collectionId: { type: "string" },
    categoryId: { type: "string" },
    subCategoryId: { type: "string" },
    languageCode: { type: "string" },
    currencyCode: { type: "string" },
    campaignName: { type: "string" },
  });
  for (const [key, op] of Object.entries(manifest.operations) as [string, any][]) {
    expect(op.title.length).toBeGreaterThan(0);
    expect(op.description.length).toBeGreaterThan(0);
    expect(op.timeoutMs).toBeGreaterThan(0);
    expect(op.timeoutMs).toBeLessThanOrEqual(300000);
    expect(op.maxInputBytes).toBeLessThanOrEqual(26214400);
    expect(op.maxResponseBytes).toBeGreaterThanOrEqual(op.maxInputBytes);
    expect(op.maxResponseBytes).toBeLessThanOrEqual(5242880);
    if (op.kind === "webhook") {
      expect(key.startsWith("webhook.")).toBe(true);
      expect(op.request).toBeUndefined();
      expect(op.sideEffect).toBe("read");
      continue;
    }
    expect(op.kind).toBe("action");
    expect(op.inputSchema.type).toBe("object");
    expect(op.outputSchema.type).toBe("object");
    expect(op.sideEffect).toBe(
      /cancel/.test(key) ? "destructive" : /create/.test(key) ? "write" : "read",
    );
    expect(op.enforceOutputSchema).toBe(true);
    expect(op.validationMode).toBe("strict-generated");
    expect(op.responseFormat).toBe("json");
  }
});
