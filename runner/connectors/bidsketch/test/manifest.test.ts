import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import cover from "./composio-cover.json";

const recipePath = join(import.meta.dir, "../../../../scripts/connector-gen/openconnector/recipes/bidsketch/recipe.json");
const operations = manifest.operations as Record<string, Record<string, unknown>>;

describe("bidsketch manifest", () => {
  it("keeps connector identity, bun runtime, and quoted token auth", () => {
    expect(manifest.key).toBe("bidsketch");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.http.baseUrl).toBe("https://bidsketch.com/api/v1");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "Authorization",
      value: 'Token token="{{apiKey}}"',
    });
    expect(manifest.network.allowedHosts).toEqual(["bidsketch.com"]);
  });

  it("is a fixed-host declarative connector with mixed read and write ops", () => {
    const ops = Object.values(operations);
    expect(Object.keys(operations).length).toBe(38);
    expect(ops.every((op) => op.kind === "action")).toBe(true);
    expect(ops.some((op) => op.sideEffect === "write")).toBe(true);
    expect(ops.some((op) => op.sideEffect === "destructive")).toBe(true);
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  it("keeps origin list/get/healthcheck contracts", () => {
    expect((operations["clients.get"] as { request: { path: string } }).request.path).toBe("/clients/{{clientId}}.json");
    expect((operations["proposals.get"] as { request: { path: string } }).request.path).toBe(
      "/proposals/{{proposalId}}.json",
    );
    expect((operations.healthcheck as { request: { path: string } }).request.path).toBe("/proposals/stats.json");
    expect((operations["clients.list"] as { request: { query: Record<string, string> } }).request.query).toEqual({
      page: "{{page}}",
      per_page: "{{perPage}}",
    });
  });

  it("keeps recipe operations equal to runner operations", () => {
    expect(existsSync(recipePath)).toBe(true);
    const recipe = JSON.parse(readFileSync(recipePath, "utf8"));
    expect(Object.keys(manifest.operations).sort()).toEqual(Object.keys(recipe.manifest.operations).sort());
    expect(recipe.selection.operations.sort()).toEqual(Object.keys(manifest.operations).sort());
    expect(Object.keys(recipe.operationSources).sort()).toEqual(Object.keys(manifest.operations).sort());
    expect(recipe.manifest.version).toBe("0.2.0");
  });

  it("declares title, description, object inputSchema, and a request for every action", () => {
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
      expect(["read", "write", "destructive"]).toContain(operation.sideEffect);
      expect(operation.enforceOutputSchema).toBe(true);
      const request = operation.request as { method?: string; success?: number[]; result?: unknown };
      if (request.method === "DELETE") {
        expect(operation.sideEffect, key).toBe("destructive");
        expect(request.success, key).toEqual([204]);
        expect(request.result, `${key} 204 needs a static result`).toBeDefined();
      } else if (request.method === "POST" || request.method === "PUT") {
        expect(operation.sideEffect, key).toBe("write");
      } else {
        expect(operation.sideEffect, key).toBe("read");
      }
    }
  });

  it("covers every Composio Bidsketch tool with a real operation", () => {
    expect(Object.keys(cover).length).toBe(38);
    for (const [slug, op] of Object.entries(cover as Record<string, string>)) {
      expect(operations[op], `${slug} -> ${op}`).toBeDefined();
      expect((operations[op] as { request?: unknown }).request, slug).toBeDefined();
    }
  });

  it("treats webhook create/delete as HTTP actions, not inbound triggers", () => {
    expect((operations["webhooks.create"] as { kind: string; sideEffect: string }).kind).toBe("action");
    expect((operations["webhooks.create"] as { sideEffect: string }).sideEffect).toBe("write");
    expect((operations["webhooks.delete"] as { sideEffect: string }).sideEffect).toBe("destructive");
  });
});
