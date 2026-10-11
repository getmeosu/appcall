import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import manifest from "../manifest.json";
import cover from "./composio-cover.json";

const recipe = JSON.parse(
  readFileSync(join(import.meta.dir, "../../../../scripts/connector-gen/openconnector/recipes/bookingmood/recipe.json"), "utf8"),
);
const operations = manifest.operations as Record<string, Record<string, unknown>>;

describe("bookingmood manifest", () => {
  it("keeps connector identity, bun runtime, and api key auth", () => {
    expect(manifest.key).toBe("bookingmood");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.version).toBe("0.3.0");
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.http.baseUrl).toBe("https://api.bookingmood.com/v1");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "Authorization",
      value: "Bearer {{apiKey}}",
    });
    expect(manifest.network.allowedHosts).toEqual(["api.bookingmood.com"]);
  });

  it("keeps recipe operations equal to runner operations", () => {
    expect(Object.keys(manifest.operations).sort()).toEqual(Object.keys(recipe.manifest.operations).sort());
    expect(recipe.selection.operations.sort()).toEqual(Object.keys(manifest.operations).sort());
    expect(Object.keys(recipe.operationSources).sort()).toEqual(Object.keys(manifest.operations).sort());
  });

  it("declares title, description, object inputSchema, and a request for every action", () => {
    for (const [key, operation] of Object.entries(operations)) {
      if (operation.kind === "webhook") continue;
      expect(operation.kind, key).toBe("action");
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
      expect(["read", "write"]).toContain(operation.sideEffect);
      expect(operation.enforceOutputSchema).toBe(true);
      expect(operation.responseFormat).toBe("json");
      expect(operation.validationMode).toBe("strict-generated");
    }
  });

  it("keeps webhook sideEffect read", () => {
    const webhooks = Object.entries(operations).filter(([, op]) => op.kind === "webhook");
    expect(webhooks.length).toBeGreaterThan(0);
    for (const [key, operation] of webhooks) {
      expect(operation.sideEffect, key).toBe("read");
      expect(operation.request, key).toBeUndefined();
    }
  });

  it("covers every Composio Bookingmood tool with a real operation", () => {
    expect(Object.keys(cover).length).toBe(142);
    for (const [slug, op] of Object.entries(cover as Record<string, string>)) {
      expect(operations[op], `${slug} -> ${op}`).toBeDefined();
    }
  });
});
