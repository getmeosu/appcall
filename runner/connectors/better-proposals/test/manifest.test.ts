import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import COMPOSIO_TOOLS from "./composio-cover.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = ["healthcheck", "brand.get", "proposals.list", "proposals.get", "templates.list", "doctypes.list"] as const;
const recipePath = join(import.meta.dir, "../../../../scripts/connector-gen/openconnector/recipes/better_proposals/recipe.json");
const compiled = compileDeclarativeConnector(manifest as never);

function requestOf(key: string): Record<string, unknown> {
  return operations[key]!.request as Record<string, unknown>;
}

describe("better-proposals manifest", () => {
  test("keeps connector identity, bun runtime, and Bptoken auth", () => {
    expect(manifest.key).toBe("better-proposals");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.http.baseUrl).toBe("https://api.betterproposals.io");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "Bptoken",
      value: "{{apiKey}}",
    });
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(manifest.network.allowedHosts).toEqual(["api.betterproposals.io"]);
    expect(manifest.http.errors.bodyErrorPaths).toEqual(["message"]);
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps the origin six operations", () => {
    for (const key of ORIGIN_OPS) {
      expect(operations[key], key).toBeDefined();
      expect(requestOf(key), key).toBeDefined();
    }
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/settings" });
    expect(requestOf("brand.get")).toMatchObject({ method: "GET", path: "/settings/brand" });
    expect(requestOf("proposals.list").path).toBe("/proposal");
    expect(requestOf("proposals.get").path).toBe("/proposal/{{id}}");
    expect((operations["proposals.get"]!.inputSchema as { required: string[] }).required).toEqual(["id"]);
    expect((requestOf("proposals.list").query as Record<string, string>).document_type_id).toBe("{{document_type_id}}");
    expect(requestOf("templates.list").path).toBe("/template");
    expect(requestOf("doctypes.list").path).toBe("/doctype");
  });

  test("covers every Composio Better Proposals tool with a real request", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(23);
    expect(Object.keys(operations).length).toBe(23);
    for (const [slug, key] of Object.entries(COMPOSIO_TOOLS)) {
      expect(operations[key], slug).toBeDefined();
      expect(requestOf(key), slug).toBeDefined();
      expect(compiled.actions[key], slug).toBeTypeOf("function");
    }
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
      expect(operation.enforceOutputSchema, key).toBe(true);
    }
  });

  test("classifies mutating HTTP methods as write", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const method = String((operation.request as Record<string, unknown>).method);
      if (["POST", "PUT", "PATCH"].includes(method)) expect(operation.sideEffect, key).toBe("write");
      else expect(operation.sideEffect, key).toBe("read");
    }
  });

  test("only interpolates path placeholders the schema requires", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      const schema = operation.inputSchema as { required?: string[] };
      const placeholders = [...String(request.path ?? "").matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)].map((match) => match[1]);
      for (const placeholder of placeholders) {
        expect(schema.required ?? [], `${key} path uses {{${placeholder}}}`).toContain(placeholder);
      }
    }
  });

  test("maps documented Better Proposals paths and Composio aliases", () => {
    expect(requestOf("companies.create")).toMatchObject({ method: "POST", path: "/company/create", bodyEncoding: "form" });
    expect(requestOf("doctypes.create")).toMatchObject({ method: "POST", path: "/doctype/create", bodyEncoding: "form" });
    expect(requestOf("proposals.covers.create")).toMatchObject({
      method: "POST",
      path: "/proposal/cover/create",
      bodyEncoding: "form",
    });
    expect(requestOf("companies.list").path).toBe("/company");
    expect(requestOf("companies.get").path).toBe("/company/{{company_id}}");
    expect(requestOf("currencies.list").path).toBe("/currency");
    expect(requestOf("currencies.get").path).toBe("/currency/{{currency_id}}");
    expect(requestOf("quotes.list").path).toBe("/quote");
    expect(requestOf("quotes.get").path).toBe("/quote/{{quote_id}}");
    expect(requestOf("templates.get").path).toBe("/template/{{template_id}}");
    expect(requestOf("proposals.new.list").path).toBe("/proposal/new");
    expect(requestOf("proposals.opened.list").path).toBe("/proposal/opened");
    expect(requestOf("proposals.sent.list").path).toBe("/proposal/sent");
    expect(requestOf("proposals.signed.list").path).toBe("/proposal/signed");
    expect(requestOf("proposals.paid.list").path).toBe("/proposal/paid");
    expect(requestOf("proposals.count").path).toBe("/proposal/count");
    expect(requestOf("merge_tags.list").path).toBe("/settings/merge_tag");
    expect((requestOf("proposals.new.list").query as Record<string, string>).document_type_id).toBe("{{type}}");
    expect((requestOf("companies.create").body as Record<string, string>).CompanyName).toBe("{{CompanyName}}");
  });

  test("sends form Content-Type only on create bodies", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      const headers = (request.headers as Record<string, string> | undefined) ?? {};
      if (request.bodyEncoding === "form") {
        expect(headers["Content-Type"], key).toBe("application/x-www-form-urlencoded");
        expect(request.body, key).toBeDefined();
      } else {
        expect(headers["Content-Type"], key).toBeUndefined();
        expect(request.body, key).toBeUndefined();
      }
    }
  });

  test("recipe operations equal runner operations", () => {
    expect(existsSync(recipePath)).toBe(true);
    const recipe = JSON.parse(readFileSync(recipePath, "utf8"));
    expect(Object.keys(manifest.operations).sort()).toEqual(Object.keys(recipe.manifest.operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(manifest.operations).sort());
    expect(Object.keys(recipe.operationSources).sort()).toEqual(Object.keys(manifest.operations).sort());
    expect(recipe.manifest.version).toBe("0.2.0");
  });
});
