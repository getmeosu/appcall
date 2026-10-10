import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import mapping from "../fixtures/composio-mapping.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = ["healthcheck", "uptimeTests.list", "uptimeTests.get", "uptimeLocations.list"] as const;
const recipe = JSON.parse(readFileSync(join(import.meta.dir, "../../../../scripts/connector-gen/openconnector/recipes/statuscake/recipe.json"), "utf8")) as {
  selection: { operations: string[] };
  manifest: { operations: Record<string, unknown> };
};
const compiled = compileDeclarativeConnector(manifest as never);

function requestOf(key: string): Record<string, unknown> {
  return operations[key]!.request as Record<string, unknown>;
}

describe("statuscake manifest", () => {
  test("keeps origin auth, host, provenance, and compiles", () => {
    expect(manifest.key).toBe("statuscake");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.network.allowedHosts).toEqual(["api.statuscake.com"]);
    expect(manifest.http.baseUrl).toBe("https://api.statuscake.com/v1");
    expect(manifest.http.auth.value).toBe("Bearer {{apiKey}}");
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(manifest.provenance.source.revision).toBe("33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a");
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps the origin four operations", () => {
    for (const key of ORIGIN_OPS) {
      expect(operations[key], key).toBeDefined();
      expect(requestOf(key), key).toBeDefined();
    }
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/uptime" });
    expect(requestOf("uptimeTests.list")).toMatchObject({ method: "GET", path: "/uptime" });
    expect(requestOf("uptimeTests.get")).toMatchObject({ method: "GET", path: "/uptime/{{test_id}}" });
    expect(requestOf("uptimeLocations.list")).toMatchObject({ method: "GET", path: "/uptime-locations" });
  });

  test("covers every Composio StatusCake tool with a real request", () => {
    expect(Object.keys(mapping.aligned)).toHaveLength(30);
    expect(Object.keys(operations).length).toBe(31);
    for (const [slug, key] of Object.entries(mapping.aligned as Record<string, string>)) {
      expect(operations[key], slug).toBeDefined();
      expect(requestOf(key), slug).toBeDefined();
      expect(compiled.actions[key], slug).toBeTypeOf("function");
    }
    expect(operations.healthcheck).toBeDefined();
  });

  test("gives every action a real request, title, description, and object inputSchema", () => {
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(["read", "write", "destructive"], key).toContain(operation.sideEffect);
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
      const request = operation.request as Record<string, unknown>;
      expect(typeof request.method, key).toBe("string");
      expect(typeof request.path, key).toBe("string");
      expect(String(request.path).startsWith("/"), key).toBe(true);
    }
  });

  test("classifies mutating HTTP methods as write or destructive", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const method = String((operation.request as Record<string, unknown>).method);
      if (method === "DELETE") expect(operation.sideEffect, key).toBe("destructive");
      else if (["POST", "PUT", "PATCH"].includes(method)) expect(operation.sideEffect, key).toBe("write");
      else expect(operation.sideEffect, key).toBe("read");
    }
  });

  test("only interpolates path placeholders the schema requires", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      const schema = operation.inputSchema as { required?: string[] };
      const placeholders = [...String(request.path ?? "").matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)].map(
        (match) => match[1],
      );
      for (const placeholder of placeholders) {
        expect(schema.required ?? [], `${key} path uses {{${placeholder}}}`).toContain(placeholder);
      }
    }
  });

  test("uses form-urlencoded bodies for StatusCake writes", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      const method = String(request.method);
      if (["POST", "PUT"].includes(method)) {
        expect(request.bodyEncoding, key).toBe("form");
        expect((request.headers as Record<string, string>)["Content-Type"], key).toBe(
          "application/x-www-form-urlencoded",
        );
      }
      if (method === "GET" || method === "DELETE") expect(request.body, key).toBeUndefined();
    }
  });

  test("maps Composio page aliases onto StatusCake limit", () => {
    const pagespeed = requestOf("pagespeedTests.list").parameters as Array<{ inputName: string; wireName: string }>;
    const heartbeat = requestOf("heartbeatTests.list").parameters as Array<{ inputName: string; wireName: string }>;
    expect(pagespeed.some((item) => item.inputName === "page_size" && item.wireName === "limit")).toBe(true);
    expect(heartbeat.some((item) => item.inputName === "per_page" && item.wireName === "limit")).toBe(true);
  });

  test("keeps recipe operations equal to runner operations", () => {
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
  });
});
