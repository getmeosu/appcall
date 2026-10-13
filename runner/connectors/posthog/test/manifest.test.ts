import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import mapping from "../fixtures/mapping.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;

function requestOf(key: string): Record<string, unknown> {
  return operations[key]!.request as Record<string, unknown>;
}
const setupKeys = new Set(
  (manifest.auth.setup.fields as Array<{ key: string }>).map((field) => field.key),
);
const READ_POST = new Set(["query.create", "endpoints.run", "llm_analytics.summarize", "llm_analytics.text_repr", "insights.generate_name", "logs.query", "llm_analytics.translate", "llm_analytics.provider_keys.validate", "hog_functions.invocations.create"]);
const SOFT_DELETE = new Set([
  "experiments.delete",
  "annotations.delete",
  "notebooks.delete",
  "dashboard_templates.delete",
  "persons.bulk_delete",
]);

describe("posthog manifest", () => {
  test("declares a filesystem-loaded first-slice connector", () => {
    expect(manifest.key).toBe("posthog");
    expect(manifest.version).toBe("0.4.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["productivity"]);
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.http.baseUrl).toBe("https://{{region}}.posthog.com");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "Authorization",
      value: "Bearer {{apiKey}}",
    });
    expect(manifest.network.allowedHosts).toEqual([
      "us.posthog.com",
      "eu.posthog.com",
      "us.i.posthog.com",
      "eu.i.posthog.com",
    ]);
    const setupFields = manifest.auth.setup.fields as Array<{ key: string; required?: boolean }>;
    expect(setupFields.map((field) => field.key)).toEqual(["apiKey", "region"]);
    expect(setupFields.find((field) => field.key === "region")?.required).toBe(true);
    expect(manifest.http.baseUrl).not.toMatch(/\{\{\s*baseUrl\s*\}\}|https:\/\/\{\{\s*host\s*\}\}/);
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("every operation is a real HTTP tool with title, description, and object inputSchema", () => {
    expect(Object.keys(operations).length).toBeGreaterThanOrEqual(21);
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      expect(operation.request, `${key} needs a request block`).toBeTruthy();
      const request = operation.request as Record<string, unknown>;
      expect(typeof request.method, key).toBe("string");
      expect(typeof request.path, key).toBe("string");
      expect(["read", "write", "destructive"]).toContain(operation.sideEffect);
    }
  });

  test("maps Composio POSTHOG tools onto request-backed operations", () => {
    const mapped = new Set(Object.values(mapping));
    expect(Object.keys(mapping).length).toBeGreaterThanOrEqual(20);
    for (const [slug, key] of Object.entries(mapping)) {
      expect(operations[key], slug).toBeTruthy();
      expect((operations[key] as { request?: unknown }).request, slug).toBeTruthy();
    }
    expect(operations.healthcheck).toBeTruthy();
    expect(operations["projects.get"]).toBeTruthy();
    const unmapped = Object.keys(operations).filter((key) => key !== "healthcheck" && key !== "projects.get" && !mapped.has(key));
    expect(unmapped).toEqual([]);
  });

  test("classifies query POST as read, DELETE as destructive, other POST/PATCH as write, GET as read", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const method = String((operation.request as { method: string }).method);
      if (READ_POST.has(key) || method === "GET") expect(operation.sideEffect, key).toBe("read");
      else if (method === "DELETE" || SOFT_DELETE.has(key)) expect(operation.sideEffect, key).toBe("destructive");
      else if (["POST", "PUT", "PATCH"].includes(method)) expect(operation.sideEffect, key).toBe("write");
    }
  });

  test("GET and DELETE are body-less; JSON Content-Type is only set when a body is declared", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as { method: string; body?: unknown; headers?: Record<string, string> };
      if (request.method === "GET" || request.method === "DELETE") {
        expect(request.body, key).toBeUndefined();
        expect(request.headers?.["Content-Type"], key).toBeUndefined();
      } else if (request.body !== undefined) {
        expect(request.headers?.["Content-Type"], key).toBe("application/json");
      } else {
        expect(request.headers?.["Content-Type"], key).toBeUndefined();
      }
    }
  });

  test("path placeholders are declared required unless they are setup fields", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      const schema = operation.inputSchema as { required?: string[] };
      const placeholders = [...String(request.path ?? "").matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)].map((m) => m[1]);
      for (const placeholder of placeholders) {
        if (setupKeys.has(placeholder)) continue;
        expect(schema.required ?? [], `${key} path uses {{${placeholder}}}`).toContain(placeholder);
      }
    }
  });

  test("capture pins the ingest host; private API stays on the cloud app host", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as { baseUrl?: string; path: string };
      const baseUrl = request.baseUrl ?? manifest.http.baseUrl;
      expect(baseUrl.includes("{{region}}"), key).toBe(true);
      if (key.startsWith("capture.")) {
        expect(baseUrl).toBe("https://{{region}}.i.posthog.com");
        if (key === "capture.event") expect(request.path).toBe("/i/v0/e/");
        else expect(request.path).toBe("/batch/");
      } else {
        expect(baseUrl).toBe("https://{{region}}.posthog.com");
        expect(request.path.startsWith("/api/"), key).toBe(true);
      }
    }
  });

  test("adds the public missing_http routes without dropping origin operations", () => {
    expect(Object.keys(operations).length).toBeGreaterThanOrEqual(405);
    expect(requestOf("feature_flags.replace")).toMatchObject({
      method: "PUT",
      path: "/api/projects/{{project_id}}/feature_flags/{{id}}/",
    });
    expect(requestOf("insights.replace")).toMatchObject({
      method: "PUT",
      path: "/api/projects/{{project_id}}/insights/{{id}}/",
    });
    expect(requestOf("insights.replace").query).toBeUndefined();
    expect(requestOf("users.retrieve")).toMatchObject({
      method: "GET",
      path: "/api/users/{{uuid}}/",
    });
    expect(requestOf("users.retrieve").body).toBeUndefined();
    expect(requestOf("hog_functions.invocations.create")).toMatchObject({
      method: "POST",
      path: "/api/projects/{{project_id}}/hog_functions/{{id}}/invocations/",
    });
    expect(operations["feature_flags.update"].request).toMatchObject({ method: "PATCH" });
    expect(operations["insights.update"].request).toMatchObject({ method: "PATCH" });
    expect(operations["users.me"].request).toMatchObject({ method: "GET", path: "/api/users/@me/" });
    expect(operations["hog_functions.invocations.create"].sideEffect).toBe("read");
  });

  test("healthcheck is GET /api/users/@me/ with a static echo", () => {
    const request = operations.healthcheck.request as Record<string, unknown>;
    expect(request.method).toBe("GET");
    expect(request.path).toBe("/api/users/@me/");
    expect(request.echo).toEqual({ status: "ok" });
    expect(operations.healthcheck.sideEffect).toBe("read");
  });
});
