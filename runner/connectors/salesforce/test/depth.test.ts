import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import cases from "./depth-cases.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";

const HANDWRITTEN = new Set([
  "contacts.create",
  "leads.create",
  "opportunities.create",
  "cases.create",
  "accounts.create",
  "accounts.get",
  "accounts.update",
  "accounts.delete",
  "contacts.get",
  "contacts.update",
  "contacts.delete",
  "leads.update",
  "leads.delete",
  "opportunities.get",
  "opportunities.update",
  "opportunities.delete",
  "cases.get",
  "cases.update",
  "cases.delete",
  "sobjects.query",
  "sobjects.search",
  "sobjects.describe",
  "users.me",
  "healthcheck",
  "jobs.ingest_upload",
  "files.version_data",
]);

type DepthCase = {
  key: string;
  input: Record<string, unknown>;
  method: string;
  status: number;
  path: string;
  query?: Record<string, string | number>;
  body?: string;
};

const CASES = cases as DepthCase[];

describe("salesforce composio depth", () => {
  test("reaches the Composio Salesforce tool count", () => {
    expect(manifest.version).toBe("0.6.0");
    expect(Object.keys(manifest.operations)).toHaveLength(292);
  });

  test("operation budgets stay inside the runner contract", () => {
    for (const [key, spec] of Object.entries(manifest.operations)) {
      const operation = spec as { timeoutMs: number; maxInputBytes: number; maxResponseBytes: number };
      expect(operation.timeoutMs, key).toBeGreaterThanOrEqual(1);
      expect(operation.timeoutMs, key).toBeLessThanOrEqual(300000);
      expect(operation.maxInputBytes, key).toBeGreaterThanOrEqual(1);
      expect(operation.maxInputBytes, key).toBeLessThanOrEqual(26214400);
      expect(operation.maxResponseBytes, key).toBeGreaterThanOrEqual(operation.maxInputBytes);
      expect(operation.maxResponseBytes, key).toBeLessThanOrEqual(52428800);
    }
  });

  test("every action has a request block or a handwritten handler", () => {
    for (const [key, spec] of Object.entries(manifest.operations)) {
      const op = spec as { kind?: string; request?: { method?: string; path?: string } };
      if (op.kind === "sync" || op.kind === "webhook") continue;
      const request = op.request;
      const declared = Boolean(request?.method && request?.path);
      expect(declared || HANDWRITTEN.has(key), key).toBe(true);
    }
  });

  test("host is a required setup field and OAuth uses accessToken", () => {
    const hostField = (manifest.auth.setup.fields as Array<{ key: string; required?: boolean }>).find((field) => field.key === "instance_host");
    expect(hostField?.required).toBe(true);
    expect(manifest.http.auth.field).toBe("accessToken");
    expect(manifest.http.auth.value).toBe("Bearer {{accessToken}}");
    expect(manifest.http.baseUrl).toBe("https://{{instance_host}}");
    expect(manifest.network.allowedHosts).toContain("*.salesforce.com");
    expect(manifest.network.allowedHosts).toContain("*.my.salesforce.com");
  });

  test("GET and DELETE stay body-less; JSON Content-Type is only set when a body is present", () => {
    for (const [key, spec] of Object.entries(manifest.operations)) {
      const operation = spec as { kind?: string; request?: { method?: string; body?: unknown; headers?: Record<string, string> } };
      if (operation.kind === "sync" || operation.kind === "webhook" || !operation.request) continue;
      const method = String(operation.request.method ?? "").toUpperCase();
      const headers = operation.request.headers ?? {};
      if (operation.request.body !== undefined) {
        expect(headers["Content-Type"], key).toBe("application/json");
      } else {
        expect(headers["Content-Type"], key).toBeUndefined();
      }
      if (method === "GET" || method === "DELETE" || method === "HEAD") {
        expect(operation.request.body, key).toBeUndefined();
      }
    }
  });

  test("webhooks are inbound reads", () => {
    for (const [key, spec] of Object.entries(manifest.operations)) {
      const operation = spec as { kind?: string; sideEffect?: string };
      if (operation.kind !== "webhook") continue;
      expect(operation.sideEffect, key).toBe("read");
    }
  });

  test("compiles a handler for every request-backed action", () => {
    const compiled = compileDeclarativeConnector(manifest as never);
    for (const [key, spec] of Object.entries(manifest.operations)) {
      const operation = spec as { kind?: string; request?: { method?: string; path?: string } };
      if (operation.kind !== "action" || !operation.request?.path) continue;
      expect(typeof compiled.actions[key], key).toBe("function");
    }
  });

  test("native recipe auth is type/scopes/setup only and operations match the runner", async () => {
    const recipe = await Bun.file(new URL("../../recipes/salesforce/recipe.json", import.meta.url)).json() as {
      auth: Record<string, unknown>;
      source: { revision: string };
      selection: { operations: string[] };
      manifest: { operations: Record<string, unknown>; auth: Record<string, unknown> };
    };
    expect(Object.keys(recipe.auth).sort()).toEqual(["scopes", "setup", "type"]);
    expect(Object.keys(recipe.manifest.auth).sort()).toEqual(["scopes", "setup", "type"]);
    expect(recipe.auth.type).toBe("oauth2");
    expect(recipe.source.revision).toBe("33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a");
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(recipe.manifest.operations).sort());
    expect(recipe.selection.operations).toHaveLength(264);
    expect(Object.keys(recipe.manifest.operations)).toHaveLength(264);
    for (const key of recipe.selection.operations) {
      expect(manifest.operations[key as keyof typeof manifest.operations], key).toBeDefined();
    }
  });

  test("new operations call the documented Salesforce resources", async () => {
    const compiled = compileDeclarativeConnector(manifest as never);
    for (const spec of CASES) {
      const action = compiled.actions[spec.key];
      expect(typeof action, spec.key).toBe("function");
      let seen: { url: string; method: string; body?: string } | undefined;
      const result = await action!({
        accessToken: "fixture-api-token",
        instance_host: "org.my.salesforce.com",
        ...spec.input,
        fetch: async (url: string | URL, init?: RequestInit) => {
          seen = {
            url: String(url),
            method: String(init?.method ?? "GET"),
            body: init?.body == null ? undefined : String(init.body),
          };
          const raw = spec.status === 204 ? "" : '{"ok":true}';
          return new Response(raw, { status: spec.status, headers: { "content-type": "application/json" } });
        },
      });
      expect(seen?.method, spec.key).toBe(spec.method);
      const url = new URL(seen!.url);
      expect(url.origin + url.pathname, spec.key).toBe(`https://org.my.salesforce.com${spec.path}`);
      const actual = [...url.searchParams.entries()];
      const expected = Object.entries(spec.query ?? {}).map(([key, value]) => [key, String(value)]);
      expect(actual, spec.key).toEqual(expected);
      expect(seen?.body, spec.key).toBe(spec.body);
      expect(result, spec.key).toMatchObject(
        spec.status === 204
          ? { connector: "salesforce", action: spec.key, source: "provider", data: null }
          : { connector: "salesforce", action: spec.key, source: "provider", data: { ok: true } },
      );
    }
  });
});
