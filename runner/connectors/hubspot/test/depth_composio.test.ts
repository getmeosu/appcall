import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import sitePageFixture from "../fixtures/site_page.json";
import workflowPerformanceFixture from "../fixtures/workflow_performance.json";
import listIdmappingFixture from "../fixtures/list_idmapping.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const compiled = compileDeclarativeConnector(manifest as never);

const NEW_OPS = [
  "cms.site-pages.get",
  "cms.site-pages.get-draft",
  "cms.site-pages.publish-draft",
  "cms.landing-pages.list-revisions",
  "email.subscriptions.get",
  "email.subscriptions.update",
  "marketing-events.participations.breakdown",
  "settings.users.list",
  "lists.idmapping",
  "lists.search",
  "lists.batch.get",
  "lists.memberships.batch.read",
  "lists.memberships.update",
  "contacts.legacy.get-by-vid",
  "contacts.legacy.batch-by-email",
  "associations.contacts.companies.batch.create",
  "associations.labels.batch.archive",
  "associations.types.list",
  "automation.workflows.performance.get",
  "objects.associations.create-labeled",
] as const;

const CREDENTIALS = { accessToken: "dummy-token" };

function requestOf(key: string): Record<string, unknown> {
  return operations[key]!.request as Record<string, unknown>;
}

function dummyInput(schema: { properties?: Record<string, any>; required?: string[] }): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const key of schema.required ?? []) {
    const prop = schema.properties?.[key] ?? {};
    if (Array.isArray(prop.enum) && prop.enum.length > 0) input[key] = prop.enum[0];
    else if (prop.type === "integer" || prop.type === "number") input[key] = 1;
    else if (prop.type === "boolean") input[key] = true;
    else if (prop.type === "array") {
      const items = prop.items ?? {};
      if (items.type === "object") input[key] = [{ id: "x" }];
      else input[key] = ["x"];
    }
    else if (prop.type === "object") input[key] = { id: "x" };
    else input[key] = "x";
  }
  return input;
}

describe("hubspot 0.5.0 composio deepen", () => {
  test("declares version 0.5.0 and the pinned open-connector revision", () => {
    expect(manifest.key).toBe("hubspot");
    expect(manifest.version).toBe("0.5.0");
    expect(manifest.runtime).toBe("bun");
    expect((manifest as { provenance?: { source?: { revision?: string } } }).provenance?.source?.revision).toBe(
      "33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a",
    );
    expect(Object.keys(manifest.auth).sort()).toEqual(["scopes", "setup", "type"]);
    expect(manifest.auth.type).toBe("oauth2");
    expect(manifest.auth.scopes).toContain("communication_preferences.read");
    expect(manifest.auth.scopes).toContain("communication_preferences.write");
    expect(manifest.auth.scopes).toContain("settings.users.read");
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("adds the unique missing Composio HTTP operations", () => {
    for (const key of NEW_OPS) {
      expect(operations[key], key).toBeDefined();
      expect(requestOf(key).method, key).toBeTypeOf("string");
      expect(String(requestOf(key).path).startsWith("/"), key).toBe(true);
      expect(compiled.actions[key], key).toBeTypeOf("function");
    }
    expect(Object.keys(operations).length).toBeGreaterThanOrEqual(295);
  });

  test("gives every new action a real request, title, description, and object inputSchema", () => {
    for (const key of NEW_OPS) {
      const operation = operations[key]!;
      expect(operation.kind, key).toBe("action");
      expect(["read", "write", "destructive"], key).toContain(operation.sideEffect);
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      expect((operation.inputSchema as { additionalProperties?: boolean }).additionalProperties, key).toBe(false);
      expect(operation.validationMode, key).toBe("strict-generated");
      expect(operation.responseFormat, key).toBe("json");
      expect(operation.enforceOutputSchema, key).toBe(true);
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
    }
  });

  test("classifies mutating HTTP methods as write or destructive", () => {
    for (const key of NEW_OPS) {
      const operation = operations[key]!;
      const method = String(requestOf(key).method);
      if (method === "DELETE") expect(operation.sideEffect, key).toBe("destructive");
      else if (["POST", "PUT", "PATCH"].includes(method)) expect(operation.sideEffect, key).toBe("write");
      else expect(operation.sideEffect, key).toBe("read");
    }
  });

  test("declares webhook operations as sideEffect read", () => {
    for (const [key, operation] of Object.entries(operations)) {
      if (operation.kind === "webhook") expect(operation.sideEffect, key).toBe("read");
    }
  });

  test("only interpolates path placeholders the schema requires", () => {
    for (const key of NEW_OPS) {
      const operation = operations[key]!;
      const request = requestOf(key);
      const schema = operation.inputSchema as { required?: string[] };
      const placeholders = [...String(request.path ?? "").matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)].map(
        (match) => match[1],
      );
      for (const placeholder of placeholders) {
        expect(schema.required ?? [], `${key} path uses {{${placeholder}}}`).toContain(placeholder);
      }
    }
  });

  test("keeps GET and DELETE body-less and sets JSON Content-Type only when a body is set", () => {
    for (const key of NEW_OPS) {
      const request = requestOf(key);
      const method = String(request.method);
      const headers = (request.headers as Record<string, string> | undefined) ?? {};
      if (method === "GET" || method === "DELETE") expect(request.body, key).toBeUndefined();
      if (request.body !== undefined) {
        const contentType = headers["Content-Type"] ?? headers["content-type"];
        expect(contentType ?? (manifest.http as { headers?: Record<string, string> }).headers?.["Content-Type"], key).toBe(
          "application/json",
        );
      } else {
        expect(headers["Content-Type"], key).toBeUndefined();
      }
    }
  });

  test("host interpolation uses only required setup fields", () => {
    expect(manifest.network.allowedHosts).toEqual(["api.hubapi.com", "app.hubspot.com"]);
    const templated = [
      (manifest.http as { baseUrl?: string }).baseUrl,
      ...NEW_OPS.map((key) => (requestOf(key) as { baseUrl?: string }).baseUrl),
    ];
    const required = new Set(
      ((manifest.auth.setup as { fields?: Array<{ key: string; required?: boolean }> }).fields ?? [])
        .filter((field) => field.required === true)
        .map((field) => field.key),
    );
    for (const value of templated) {
      if (typeof value !== "string") continue;
      for (const match of value.matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)) {
        expect(required.has(match[1]!), `{{${match[1]}}}`).toBe(true);
      }
    }
  });

  test("native recipe is auth type, scopes, and setup only", async () => {
    const recipe = (await Bun.file(new URL("../../recipes/hubspot/recipe.json", import.meta.url)).json()) as {
      auth: { type: string; scopes: string[]; setup: { fields: Array<{ key: string }> } };
    };
    expect(Object.keys(recipe).sort()).toEqual(["auth"]);
    expect(Object.keys(recipe.auth).sort()).toEqual(["scopes", "setup", "type"]);
    expect(recipe.auth.type).toBe(manifest.auth.type);
    expect(recipe.auth.scopes).toEqual(manifest.auth.scopes);
    expect(recipe.auth.setup).toEqual(manifest.auth.setup);
  });
});

describe("hubspot compiled new ops", () => {
  const jsonResponse = (body: unknown, status = 200) =>
    new Response(body === null ? null : JSON.stringify(body), {
      status,
      headers: body === null ? undefined : { "content-type": "application/json" },
    });

  async function invoke(
    key: string,
    input: Record<string, unknown>,
    respond: (request: Request) => Promise<Response> | Response,
  ) {
    const requests: Request[] = [];
    const result = await compiled.actions[key]!({
      ...CREDENTIALS,
      ...input,
      fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(url, init);
        requests.push(request);
        return respond(request);
      },
    });
    return { requests, result };
  }

  test("every new operation dispatches a real HTTPS request to api.hubapi.com", async () => {
    for (const key of NEW_OPS) {
      const request = requestOf(key) as { method: string; path: string; success?: number[]; body?: unknown };
      const input = dummyInput(operations[key]!.inputSchema as { properties?: Record<string, any>; required?: string[] });
      const status = request.success?.[0] ?? 200;
      const payload = status === 204 ? null : { id: "x" };
      const { requests, result } = await invoke(key, input, () => jsonResponse(payload, status));
      expect(requests, key).toHaveLength(1);
      expect(requests[0]!.method, key).toBe(request.method);
      const url = new URL(requests[0]!.url);
      expect(url.protocol, key).toBe("https:");
      expect(url.hostname, key).toBe("api.hubapi.com");
      expect(requests[0]!.headers.get("authorization"), key).toBe("Bearer dummy-token");
      expect(requests[0]!.headers.get("accept"), key).toBe("application/json");
      if (request.method === "GET" || request.method === "DELETE") {
        expect(request.body, key).toBeUndefined();
        expect(await requests[0]!.clone().text(), key).toBe("");
      }
      if (request.body !== undefined) {
        const body = await requests[0]!.clone().text();
        expect(body.length, key).toBeGreaterThan(0);
        expect(() => JSON.parse(body), key).not.toThrow();
      }
      expect(result).toMatchObject({ connector: "hubspot", action: key, source: "provider" });
    }
  });

  test("cms.site-pages.get is a body-less GET", async () => {
    const { requests, result } = await invoke("cms.site-pages.get", { page_id: "123" }, () =>
      jsonResponse(sitePageFixture),
    );
    expect(requests[0]!.method).toBe("GET");
    expect(new URL(requests[0]!.url).pathname).toBe("/cms/v3/pages/site-pages/123");
    expect(await requests[0]!.clone().text()).toBe("");
    expect(result).toMatchObject({
      connector: "hubspot",
      action: "cms.site-pages.get",
      source: "provider",
      data: sitePageFixture,
    });
  });

  test("cms.site-pages.publish-draft POSTs without a body", async () => {
    const { requests } = await invoke("cms.site-pages.publish-draft", { page_id: "123" }, () => jsonResponse(null, 204));
    expect(requests[0]!.method).toBe("POST");
    expect(new URL(requests[0]!.url).pathname).toBe("/cms/v3/pages/site-pages/123/draft/push-live");
    expect(await requests[0]!.clone().text()).toBe("");
  });

  test("automation.workflows.performance.get sends required query params", async () => {
    const { requests, result } = await invoke(
      "automation.workflows.performance.get",
      { workflow_id: "99", start: 1, end: 2, bucket: "DAY" },
      () => jsonResponse(workflowPerformanceFixture),
    );
    const url = new URL(requests[0]!.url);
    expect(url.pathname).toBe("/automation/v3/performance/workflow/99");
    expect(url.searchParams.get("start")).toBe("1");
    expect(url.searchParams.get("end")).toBe("2");
    expect(url.searchParams.get("bucket")).toBe("DAY");
    expect(result).toMatchObject({ data: workflowPerformanceFixture });
  });

  test("lists.idmapping posts the official input array", async () => {
    const { requests, result } = await invoke("lists.idmapping", { input: ["1"] }, () =>
      jsonResponse(listIdmappingFixture),
    );
    expect(requests[0]!.method).toBe("POST");
    expect(new URL(requests[0]!.url).pathname).toBe("/crm/lists/2026-09/idmapping");
    expect(JSON.parse(await requests[0]!.clone().text())).toEqual({ input: ["1"] });
    expect(result).toMatchObject({ data: listIdmappingFixture });
  });

  test("lists.memberships.update interpolates add/remove into the path", async () => {
    const { requests } = await invoke(
      "lists.memberships.update",
      { list_id: "5", operation: "add", record_ids: ["9"] },
      () => jsonResponse({ recordsIdsAdded: ["9"] }),
    );
    expect(requests[0]!.method).toBe("PUT");
    expect(new URL(requests[0]!.url).pathname).toBe("/crm/lists/2026-09/5/memberships/add");
    expect(JSON.parse(await requests[0]!.clone().text())).toEqual({ recordIds: ["9"] });
  });

  test("email.subscriptions.get encodes the address in the path", async () => {
    const { requests } = await invoke("email.subscriptions.get", { email_address: "a@b.com" }, () =>
      jsonResponse({ subscribed: true }),
    );
    expect(new URL(requests[0]!.url).pathname).toBe("/email/public/v1/subscriptions/a%40b.com");
    expect(await requests[0]!.clone().text()).toBe("");
  });
});
