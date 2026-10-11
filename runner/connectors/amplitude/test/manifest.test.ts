import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import mapping from "../fixtures/mapping.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const origin = [
  "healthcheck",
  "events.list",
  "users.search",
  "users.activity",
  "events.segmentation",
  "funnels.get",
  "retention.get",
  "annotations.list",
  "annotations.create",
  "annotations.delete",
  "taxonomy.events.list",
  "taxonomy.events.create",
  "taxonomy.eventProperties.list",
  "taxonomy.userProperties.list",
  "taxonomy.categories.list",
  "cohorts.list",
  "cohorts.get",
  "releases.list",
  "releases.create",
  "usermap.get",
] as const;
const httpApi = ["users.identify", "events.send", "events.batch"] as const;
const webhooks = ["webhook.event", "webhook.cohort"] as const;
const setupKeys = new Set((manifest.auth.setup.fields as Array<{ key: string }>).map((field) => field.key));

describe("amplitude manifest", () => {
  test("keeps origin auth, provenance, and the twenty live Dashboard REST ops", () => {
    expect(manifest.key).toBe("amplitude");
    expect(manifest.version).toBe("0.4.0");
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.auth.scopes).toEqual([]);
    expect(manifest.auth.setup).toEqual({
      mode: "api_key",
      fields: [
        { key: "apiKey", label: "Amplitude Secret Key", required: true, secret: true },
        { key: "apiKeyId", label: "Amplitude API Key", required: true, secret: false },
      ],
    });
    expect(manifest.http.baseUrl).toBe("https://amplitude.com");
    expect(manifest.http.auth).toEqual({
      in: "header",
      name: "Authorization",
      basic: { username: "{{apiKeyId}}", password: "{{apiKey}}" },
      field: "apiKey",
    });
    expect(manifest.network.allowedHosts).toEqual(["amplitude.com", "api.amplitude.com", "api2.amplitude.com"]);
    expect(manifest.provenance.source).toEqual({
      url: "https://github.com/oomol-lab/open-connector",
      revision: "33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a",
    });
    for (const key of origin) expect(operations[key], key).toBeTruthy();
    expect(operations.healthcheck.request.path).toBe("/api/2/events/list");
    expect(operations["users.search"].request.path).toBe("/api/2/usersearch");
    expect(operations["annotations.delete"].request.method).toBe("DELETE");
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("every HTTP action is a real tool; webhooks are EventOnly reads", () => {
    expect(Object.keys(operations).length).toBe(59);
    for (const [key, operation] of Object.entries(operations)) {
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      if (operation.kind === "webhook") {
        expect(webhooks, key).toContain(key);
        expect(operation.sideEffect, key).toBe("read");
        expect(operation.request, key).toBeUndefined();
        continue;
      }
      expect(operation.kind, key).toBe("action");
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      expect(operation.request, `${key} needs a request block`).toBeTruthy();
      const request = operation.request as Record<string, unknown>;
      expect(typeof request.method, key).toBe("string");
      expect(typeof request.path, key).toBe("string");
      expect(operation.enforceOutputSchema, key).toBe(true);
      expect(operation.validationMode, key).toBe("strict-generated");
      expect(operation.responseFormat, key).toBe("json");
    }
  });

  test("GET/DELETE stay body-less; JSON Content-Type is set only when a JSON body is set", () => {
    for (const [key, operation] of Object.entries(operations)) {
      if (operation.kind === "webhook") continue;
      const request = operation.request as Record<string, unknown>;
      const method = String(request.method);
      const headers = (request.headers ?? {}) as Record<string, string>;
      const contentType = headers["Content-Type"] ?? headers["content-type"];
      if (method === "GET" || method === "DELETE") {
        expect(request.body, key).toBeUndefined();
        expect(contentType, key).toBeUndefined();
        expect(operation.sideEffect, key).toBe(method === "DELETE" ? "destructive" : "read");
      } else if (request.body !== undefined) {
        if (request.bodyEncoding === "form") {
          expect(contentType, key).toBe("application/x-www-form-urlencoded");
        } else {
          expect(contentType, key).toBe("application/json");
        }
        expect(["POST", "PUT", "PATCH"], key).toContain(method);
        expect(operation.sideEffect, key).toBe("write");
      }
    }
  });

  test("path placeholders are declared required unless they are setup fields", () => {
    for (const [key, operation] of Object.entries(operations)) {
      if (operation.kind === "webhook") continue;
      const request = operation.request as Record<string, unknown>;
      const schema = operation.inputSchema as { required?: string[] };
      const placeholders = [...String(request.path ?? "").matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)].map((m) => m[1]);
      for (const placeholder of placeholders) {
        if (setupKeys.has(placeholder)) continue;
        expect(schema.required ?? [], `${key} path uses {{${placeholder}}}`).toContain(placeholder);
      }
    }
  });

  test("identify, HTTP V2, and batch pin api2.amplitude.com", () => {
    for (const key of httpApi) {
      const request = operations[key].request as { baseUrl?: string; path: string; method: string };
      expect(request.method).toBe("POST");
      expect(request.baseUrl).toBe("https://api2.amplitude.com");
      expect(manifest.network.allowedHosts).toContain("api2.amplitude.com");
    }
    expect(operations["users.identify"].request.path).toBe("/identify");
    expect(operations["events.send"].request.path).toBe("/2/httpapi");
    expect(operations["events.batch"].request.path).toBe("/batch");
  });

  test("maps every live Composio AMPLITUDE tool onto a request-backed operation", () => {
    expect(Object.keys(mapping).length).toBe(54);
    const runnable = Object.values(operations).filter((operation) => operation.request).length;
    expect(runnable).toBeGreaterThanOrEqual(54);
    for (const [slug, key] of Object.entries(mapping as Record<string, string>)) {
      expect(operations[key], slug).toBeTruthy();
      expect((operations[key] as { request?: unknown }).request, slug).toBeTruthy();
      expect(String(operations[key].description), slug).toContain(slug);
    }
  });

  test("recipe operations equal runner operations", async () => {
    const recipe = await Bun.file(new URL("../../recipes/amplitude/recipe.json", import.meta.url)).json();
    expect(recipe.manifest.auth).toEqual({
      type: "api_key",
      scopes: [],
      setup: manifest.auth.setup,
    });
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.manifest.network.allowedHosts).toEqual(["amplitude.com", "api.amplitude.com", "api2.amplitude.com"]);
    expect(recipe.source.revision).toBe("33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a");
  });
});
