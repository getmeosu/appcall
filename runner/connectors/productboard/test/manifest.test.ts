import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";

const operations = manifest.operations as Record<string, any>;
const ORIGINAL = [
  "healthcheck",
  "entities.list",
  "entities.get",
  "notes.list",
  "notes.get",
  "members.list",
  "members.get",
] as const;

describe("productboard manifest", () => {
  test("keeps identity, host pin, and bearer auth", () => {
    expect(manifest.key).toBe("productboard");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.network.allowedHosts).toEqual(["api.productboard.com"]);
    expect(manifest.http.baseUrl).toBe("https://api.productboard.com/v2");
    expect(manifest.http.auth).toEqual({
      field: "accessToken",
      in: "header",
      name: "Authorization",
      value: "Bearer {{accessToken}}",
    });
  });

  test("keeps the origin/main read operations", () => {
    for (const key of ORIGINAL) {
      expect(operations[key]).toBeDefined();
      expect(operations[key].sideEffect).toBe("read");
      expect(operations[key].request).toBeDefined();
    }
    expect(operations.healthcheck.request.path).toBe("/members");
    expect(operations["entities.get"].request.path).toBe("/entities/{{id}}");
  });

  test("gives every action a real request, title, description, and object inputSchema", () => {
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(operation.title, key).toBeTruthy();
      expect(operation.description, key).toBeTruthy();
      expect(operation.inputSchema?.type, key).toBe("object");
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
      expect(operation.request.method, key).toBeTruthy();
      expect(operation.request.path, key).toBeTruthy();
      expect(["read", "write"]).toContain(operation.sideEffect);
      if (operation.kind === "webhook") expect(operation.sideEffect).toBe("read");
    }
  });

  test("does not follow caller-supplied pagination URLs", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const query = JSON.stringify(operation.request?.query ?? {});
      const path = String(operation.request?.path ?? "");
      expect(query.includes("pageUrl") || path.includes("pageUrl"), key).toBe(false);
      expect(query.includes("next_page_url"), key).toBe(false);
    }
  });
});
