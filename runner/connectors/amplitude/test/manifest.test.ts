import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
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

// ops the pinned recipe has real provenance for
const PINNED_OPS = [
  "annotationCategories.assign",
  "annotationCategories.create",
  "annotationCategories.delete",
  "annotationCategories.get",
  "annotationCategories.list",
  "annotationCategories.update",
  "annotations.create",
  "annotations.delete",
  "annotations.get",
  "annotations.list",
  "annotations.update",
  "cohorts.download",
  "cohorts.get",
  "cohorts.list",
  "cohorts.membership",
  "cohorts.request",
  "cohorts.status",
  "cohorts.upload",
  "deletions.cancel",
  "deletions.create",
  "deletions.list",
  "events.batch",
  "events.list",
  "events.segmentation",
  "events.send",
  "funnels.get",
  "groups.identify",
  "healthcheck",
  "releases.create",
  "releases.list",
  "retention.get",
  "revenue.ltv",
  "sessions.average",
  "sessions.length",
  "sessions.perUser",
  "taxonomy.categories.create",
  "taxonomy.categories.delete",
  "taxonomy.categories.list",
  "taxonomy.categories.update",
  "taxonomy.eventProperties.get",
  "taxonomy.eventProperties.list",
  "taxonomy.events.create",
  "taxonomy.events.delete",
  "taxonomy.events.get",
  "taxonomy.events.list",
  "taxonomy.events.restore",
  "taxonomy.events.update",
  "taxonomy.userProperties.get",
  "taxonomy.userProperties.list",
  "usermap.create",
  "usermap.get",
  "users.active",
  "users.activity",
  "users.composition",
  "users.identify",
  "users.realtime",
  "users.search",
  "webhook.cohort",
  "webhook.event",
];
// ops this branch added from the provider's live API; no pinned action id exists
const DEEPENED_OPS = ["annotations.v3.create", "annotations.v3.delete", "annotations.v3.list"];

describe("amplitude manifest", () => {
  test("keeps origin auth, provenance, and the twenty live Dashboard REST ops", () => {
    expect(manifest.key).toBe("amplitude");
    expect(manifest.version).toBe("0.4.1");
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
    expect(Object.keys(operations).length).toBe(62);
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
        expect(operation.sideEffect, key).toBe(
          key === "annotations.v3.delete" ? "write" : method === "DELETE" ? "destructive" : "read",
        );
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
    expect(mapping.AMPLITUDE_LIST_ANNOTATIONS).toBe("annotations.v3.list");
    expect(mapping.AMPLITUDE_CREATE_ANNOTATION).toBe("annotations.v3.create");
    expect(mapping.AMPLITUDE_DELETE_ANNOTATION).toBe("annotations.v3.delete");
    expect(mapping.AMPLITUDE_GET_ANNOTATION).toBe("annotations.get");
    expect(mapping.AMPLITUDE_UPDATE_ANNOTATION).toBe("annotations.update");
    const runnable = Object.values(operations).filter((operation) => operation.request).length;
    expect(runnable).toBeGreaterThanOrEqual(54);
    for (const [slug, key] of Object.entries(mapping as Record<string, string>)) {
      expect(operations[key], slug).toBeTruthy();
      expect((operations[key] as { request?: unknown }).request, slug).toBeTruthy();
      expect(String(operations[key].description), slug).toContain(slug);
    }
  });

  test("recipe mirrors the deepened operations; provenance mappings stay pinned", () => {
    const recipePath = "scripts/connector-gen/openconnector/recipes/amplitude/recipe.json";
    expect(existsSync(recipePath)).toBe(true);
    const recipe = JSON.parse(readFileSync(recipePath, "utf8")) as {
      source: { revision: string };
      selection: { operations: string[] };
      operationSources: Record<string, unknown>;
      manifest: {
        version: string;
        auth: unknown;
        network: { allowedHosts: string[] };
        operations: Record<string, Record<string, unknown>>;
      };
    };
    const runnerOps = Object.keys(operations).sort();
    const recipeOps = Object.keys(recipe.manifest.operations).sort();
    expect(recipe.manifest.version).toBe("0.2.0");
    expect(recipeOps).toHaveLength(62);
    expect(runnerOps).toEqual(recipeOps);
    expect([...recipe.selection.operations].sort()).toEqual(PINNED_OPS);
    expect(Object.keys(recipe.operationSources).sort()).toEqual(PINNED_OPS);
    expect(runnerOps.filter((key) => !Object.hasOwn(recipe.operationSources, key))).toEqual(DEEPENED_OPS);
    expect(recipe.manifest.auth).toEqual({
      type: "api_key",
      scopes: [],
      setup: manifest.auth.setup,
    });
    expect(recipe.manifest.network.allowedHosts).toEqual(["amplitude.com"]);
    expect(manifest.network.allowedHosts).toEqual(["amplitude.com", "api.amplitude.com", "api2.amplitude.com"]);
    expect(manifest.network.allowedHosts).not.toContain("analytics.eu.amplitude.com");
    expect(recipe.source.revision).toBe("33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a");
    // Origin recipe descriptions for the original Dashboard ops already differ from the runner.
    const descriptionDrift = [
      "annotations.create",
      "annotations.delete",
      "annotations.list",
      "cohorts.get",
      "cohorts.list",
      "events.list",
      "events.segmentation",
      "funnels.get",
      "healthcheck",
      "releases.create",
      "releases.list",
      "retention.get",
      "taxonomy.categories.list",
      "taxonomy.eventProperties.list",
      "taxonomy.events.create",
      "taxonomy.events.list",
      "taxonomy.userProperties.list",
      "usermap.get",
      "users.activity",
      "users.search",
    ];
    const drifted: string[] = [];
    for (const key of recipeOps) {
      const runnerOp = operations[key] as Record<string, unknown>;
      const recipeOp = recipe.manifest.operations[key]!;
      const { description: runnerDescription, ...runnerRest } = runnerOp;
      const { description: recipeDescription, ...recipeRest } = recipeOp;
      expect(runnerRest, key).toEqual(recipeRest);
      if (runnerDescription !== recipeDescription) drifted.push(key);
    }
    expect(drifted).toEqual(descriptionDrift);
  });

  test("adds chart annotation v3 list, create, and delete beside the v2 routes", () => {
    const sibling = operations["annotations.get"]!;
    expect((operations["annotations.list"]!.request as { path: string }).path).toBe("/api/2/annotations");
    expect((operations["annotations.create"]!.request as { method: string; path: string }).method).toBe("POST");
    expect((operations["annotations.create"]!.request as { path: string }).path).toBe("/api/2/annotations");
    expect((operations["annotations.delete"]!.request as { path: string }).path).toBe("/api/2/annotations");
    expect((operations["annotations.get"]!.request as { path: string }).path).toBe("/api/3/annotations/{{annotationId}}");
    expect((operations["annotations.update"]!.request as { method: string; path: string }).method).toBe("PUT");
    expect((operations["annotations.update"]!.request as { path: string }).path).toBe("/api/3/annotations/{{annotationId}}");

    const list = operations["annotations.v3.list"]!;
    const create = operations["annotations.v3.create"]!;
    const remove = operations["annotations.v3.delete"]!;
    expect(list.title).toBe("List chart annotations");
    expect(create.title).toBe("Create chart annotation");
    expect(remove.title).toBe("Delete chart annotation");
    expect(list.sideEffect).toBe("read");
    expect(create.sideEffect).toBe("write");
    expect(remove.sideEffect).toBe("write");
    for (const operation of [list, create, remove]) {
      expect(operation.timeoutMs).toBe(sibling.timeoutMs);
      expect(operation.maxInputBytes).toBe(sibling.maxInputBytes);
      expect(operation.maxResponseBytes).toBe(sibling.maxResponseBytes);
      expect(operation.responseFormat).toBe(sibling.responseFormat);
      expect(operation.validationMode).toBe(sibling.validationMode);
      expect(operation.enforceOutputSchema).toBe(sibling.enforceOutputSchema);
      const request = operation.request as {
        baseUrl?: string;
        success: number[];
        headers: Record<string, string>;
        result: string;
      };
      expect(request.baseUrl).toBeUndefined();
      expect(request.success).toEqual([200]);
      expect(request.headers.Accept).toBe("application/json");
      expect(request.result).toBe("{{response}}");
    }
    expect(list.request).toEqual({
      method: "GET",
      path: "/api/3/annotations",
      success: [200],
      headers: { Accept: "application/json" },
      query: {
        category: "{{category}}",
        chart_id: "{{chartId}}",
        start: "{{start}}",
        end: "{{end}}",
      },
      result: "{{response}}",
    });
    expect(create.request).toEqual({
      method: "POST",
      path: "/api/3/annotations",
      success: [200],
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: {
        label: "{{label}}",
        start: "{{start}}",
        category: "{{category}}",
        chart_id: "{{chartId}}",
        details: "{{details}}",
        end: "{{end}}",
      },
      result: "{{response}}",
    });
    expect(remove.request).toEqual({
      method: "DELETE",
      path: "/api/3/annotations/{{annotationId}}",
      success: [200],
      headers: { Accept: "application/json" },
      result: "{{response}}",
    });
    expect(list.inputSchema).toEqual({
      type: "object",
      properties: {
        category: { type: "string", description: "Optional category name filter." },
        chartId: { type: "string", description: "Optional chart ID filter." },
        start: { type: "string", description: "Optional ISO 8601 range start." },
        end: { type: "string", description: "Optional ISO 8601 range end." },
      },
      additionalProperties: false,
    });
    expect(create.inputSchema).toEqual({
      type: "object",
      properties: {
        label: { type: "string", description: "Annotation title." },
        start: { type: "string", description: "ISO 8601 start timestamp." },
        category: { type: "string", description: "Optional category name." },
        chartId: { type: "string", description: "Optional chart ID." },
        details: { type: "string", description: "Optional annotation details." },
        end: { type: "string", description: "Optional ISO 8601 end timestamp." },
      },
      additionalProperties: false,
      required: ["label", "start"],
    });
    expect(remove.inputSchema).toEqual({
      type: "object",
      properties: {
        annotationId: { type: "string", minLength: 1, description: "Annotation ID." },
      },
      additionalProperties: false,
      required: ["annotationId"],
    });
    expect(list.outputSchema).toEqual({
      type: "object",
      required: ["data"],
      properties: { data: { type: "array", items: { type: "object" } } },
      additionalProperties: false,
    });
    expect(create.outputSchema).toEqual({
      type: "object",
      required: ["data"],
      properties: { data: { type: "object" } },
      additionalProperties: false,
    });
    expect(remove.outputSchema).toEqual({
      type: "object",
      required: ["success"],
      properties: { success: { type: "boolean" } },
      additionalProperties: false,
    });
  });
});
