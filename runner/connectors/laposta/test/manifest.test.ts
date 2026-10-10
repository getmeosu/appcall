import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import manifest from "../manifest.json";
import mapping from "../fixtures/composio-mapping.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import { handwritten } from "../src/actions";

const recipe = JSON.parse(
  readFileSync(join(import.meta.dir, "../../../../scripts/connector-gen/openconnector/recipes/laposta/recipe.json"), "utf8"),
) as {
  selection: { operations: string[] };
  manifest: { operations: Record<string, unknown> };
};

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = ["healthcheck", "lists.list", "lists.get", "members.list", "members.get"] as const;

describe("laposta manifest", () => {
  it("keeps the public api-key contract and pinned provenance", () => {
    expect(manifest.key).toBe("laposta");
    expect(manifest.visibility).toBe("public");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.basic).toEqual({ username: "{{apiKey}}", password: "" });
    expect(manifest.http.baseUrl).toBe("https://api.laposta.org");
    expect(manifest.network.allowedHosts).toEqual(["api.laposta.org"]);
    expect(manifest.provenance).toEqual({
      source: { url: "https://github.com/oomol-lab/open-connector", revision: "33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a" },
    });
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  it("keeps the origin five operations", () => {
    for (const key of ORIGIN_OPS) {
      expect(operations[key], key).toBeDefined();
      expect((operations[key] as { request?: unknown }).request, key).toBeDefined();
    }
    expect((operations.healthcheck.request as { path: string }).path).toBe("/v2/list");
    expect((operations["lists.get"].request as { path: string }).path).toBe("/v2/list/{{list_id}}");
    expect((operations["members.get"].request as { path: string }).path).toBe("/v2/member/{{member_id}}");
  });

  it("exposes every action as a real HTTP tool with title, description, and object inputSchema", () => {
    const actions = Object.entries(operations);
    expect(actions.length).toBe(26);
    for (const [key, operation] of actions) {
      expect(operation.kind, key).toBe("action");
      expect(["read", "write", "destructive"], key).toContain(operation.sideEffect);
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
      const request = operation.request as { method?: string; path?: string };
      expect(request.method, key).toMatch(/^(GET|POST|DELETE)$/);
      expect(String(request.path).startsWith("/"), key).toBe(true);
    }
  });

  it("maps every Composio Laposta tool onto a runner operation", () => {
    expect(mapping.composio_tools).toBe(25);
    expect(Object.keys(mapping.aligned).length).toBe(25);
    expect(mapping.skipped).toEqual({});
    const compiled = compileDeclarativeConnector(manifest as never);
    for (const [slug, key] of Object.entries(mapping.aligned as Record<string, string>)) {
      expect(operations[key], slug).toBeDefined();
      expect((compiled.actions[key] ?? handwritten[key]), slug).toBeTypeOf("function");
    }
  });

  it("keeps recipe operations equal to runner operations", () => {
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
  });

  it("classifies mutating HTTP methods as write or destructive", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const method = String((operation.request as { method?: string }).method);
      if (method === "DELETE") expect(operation.sideEffect, key).toBe("destructive");
      else if (method === "POST") expect(operation.sideEffect, key).toBe("write");
      else expect(operation.sideEffect, key).toBe("read");
    }
  });

  it("only interpolates path placeholders the schema requires", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as { path?: string };
      const schema = operation.inputSchema as { required?: string[] };
      const placeholders = [...String(request.path ?? "").matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)].map(
        (match) => match[1],
      );
      for (const placeholder of placeholders) {
        expect(schema.required ?? [], `${key} path uses {{${placeholder}}}`).toContain(placeholder);
      }
    }
  });
});
