import { describe, expect, it } from "bun:test";
import { generateManifest } from "../openapi";

const spec = {
  openapi: "3.0.3",
  info: { title: "Demo API", version: "1.0.0" },
  servers: [{ url: "https://api.demo.test/v1" }],
  paths: {
    "/contacts": {
      get: {
        operationId: "listContacts",
        tags: ["Contacts"],
        summary: "List contacts",
        description: "Return a page of contacts.",
        parameters: [
          { name: "limit", in: "query", required: false, schema: { type: "integer" }, description: "Page size." },
          { name: "cursor", in: "query", required: false, schema: { type: "string" } },
          { name: "X-Trace", in: "header", required: false, schema: { type: "string" } },
        ],
        responses: { "200": { description: "ok", content: { "application/json": { schema: { $ref: "#/components/schemas/ContactPage" } } } } },
      },
      post: {
        operationId: "createContact",
        tags: ["Contacts"],
        summary: "Create contact",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/ContactInput" } } },
        },
        responses: { "201": { description: "created", content: { "application/json": { schema: { $ref: "#/components/schemas/Contact" } } } } },
      },
    },
    "/contacts/{contactId}": {
      get: {
        operationId: "getContact",
        tags: ["Contacts"],
        summary: "Get contact",
        parameters: [{ name: "contactId", in: "path", required: true, schema: { type: "string" }, description: "Contact ID." }],
        responses: { "200": { description: "ok" } },
      },
      delete: {
        operationId: "deleteContact",
        tags: ["Contacts"],
        summary: "Delete contact",
        parameters: [{ name: "contactId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "204": { description: "gone" } },
      },
    },
    "/admin/audit": {
      get: { operationId: "listAudit", tags: ["Admin"], summary: "List audit", responses: { "200": { description: "ok" } } },
    },
  },
  components: {
    schemas: {
      Contact: { type: "object", properties: { id: { type: "string" }, email: { type: "string" } } },
      ContactInput: {
        type: "object",
        required: ["email"],
        properties: {
          email: { type: "string", description: "Contact email." },
          name: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
        },
      },
      ContactPage: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Contact" } } } },
    },
  },
};

const options = {
  key: "demo",
  name: "Demo",
  categories: ["crm"],
  models: ["contact"],
  auth: { type: "api_key", field: "apiKey", in: "header" as const, name: "Authorization", value: "Bearer {{apiKey}}", label: "API key" },
};

const pathItemParameterSpec = {
  openapi: "3.0.3",
  info: { title: "Path Item API", version: "1.0.0" },
  servers: [{ url: "https://api.path-item.test" }],
  paths: {
    "/accounts/{accountId}/widgets": {
      parameters: [
        { name: "accountId", in: "path", required: true, schema: { type: "string" }, description: "Inherited account." },
        { $ref: "#/components/parameters/WorkspaceId" },
        { name: "trace", in: "header", required: true, schema: { type: "string" }, description: "Inherited trace header." },
        { $ref: "#/components/parameters/Limit" },
      ],
      get: {
        operationId: "listWidgets",
        tags: ["Widgets"],
        summary: "List widgets",
        parameters: [
          { $ref: "#/components/parameters/AccountIdOverride" },
          { name: "limit", in: "query", required: true, schema: { type: "integer" }, description: "Operation limit." },
          { $ref: "#/components/parameters/RequestId" },
          { name: "trace", in: "query", required: false, schema: { type: "string" }, description: "Operation trace query." },
        ],
        responses: { "200": { description: "ok" } },
      },
    },
  },
  components: {
    parameters: {
      WorkspaceId: { name: "workspaceId", in: "query", required: true, schema: { type: "string" }, description: "Workspace identifier." },
      Limit: { name: "limit", in: "query", required: false, schema: { type: "string" }, description: "Inherited limit." },
      AccountIdOverride: { name: "accountId", in: "path", required: true, schema: { type: "string" }, description: "Operation account." },
      RequestId: { name: "requestId", in: "header", required: true, schema: { type: "string" }, description: "Request identifier." },
    },
  },
};

describe("generateManifest", () => {
  it("builds the connector envelope from the spec and options", () => {
    const manifest = generateManifest(spec, options);
    expect(manifest.key).toBe("demo");
    expect(manifest.name).toBe("Demo");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["crm"]);
    expect(manifest.models).toEqual(["contact"]);
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.auth.setup.fields).toEqual([{ key: "apiKey", label: "API key", required: true, secret: true }]);
    expect(manifest.network.allowedHosts).toEqual(["api.demo.test"]);
    expect(manifest.http.baseUrl).toBe("https://api.demo.test/v1");
    expect(manifest.http.auth).toEqual({ field: "apiKey", in: "header", name: "Authorization", value: "Bearer {{apiKey}}" });
  });

  it("names operations resource.verb from tag, method, and path shape", () => {
    const manifest = generateManifest(spec, options);
    expect(Object.keys(manifest.operations).sort()).toEqual([
      "admin.list",
      "contacts.create",
      "contacts.delete",
      "contacts.get",
      "contacts.list",
    ]);
  });

  it("keeps only the tags asked for", () => {
    const manifest = generateManifest(spec, { ...options, includeTags: ["Contacts"] });
    expect(Object.keys(manifest.operations).sort()).toEqual([
      "contacts.create",
      "contacts.delete",
      "contacts.get",
      "contacts.list",
    ]);
  });

  it("honours an explicit operation key override", () => {
    const manifest = generateManifest(spec, { ...options, operationKeys: { listContacts: "contacts.search" } });
    expect(manifest.operations["contacts.search"]).toBeDefined();
    expect(manifest.operations["contacts.list"]).toBeUndefined();
  });

  it("turns query parameters into an input schema and a query template", () => {
    const operation = generateManifest(spec, options).operations["contacts.list"]!;
    expect(operation.kind).toBe("action");
    expect(operation.sideEffect).toBe("read");
    expect(operation.title).toBe("List contacts");
    expect(operation.description).toContain("Return a page of contacts.");
    expect(operation.inputSchema.properties.limit).toEqual({ type: "integer", description: "Page size." });
    expect(operation.inputSchema.required).toBeUndefined();
    expect(operation.request.query).toEqual({ limit: "{{limit}}", cursor: "{{cursor}}" });
    expect(operation.request.headers).toEqual({ "X-Trace": "{{X-Trace}}" });
    expect(operation.request.method).toBe("GET");
    expect(operation.request.path).toBe("/contacts");
    expect(operation.request.success).toEqual([200]);
  });

  it("marks path parameters required and interpolates them into the path", () => {
    const operation = generateManifest(spec, options).operations["contacts.get"]!;
    expect(operation.request.path).toBe("/contacts/{{contactId}}");
    expect(operation.inputSchema.required).toEqual(["contactId"]);
    expect(operation.inputSchema.properties.contactId).toEqual({ type: "string", description: "Contact ID." });
  });

  it("merges Path Item and operation parameters by name and location", () => {
    const operation = generateManifest(pathItemParameterSpec, options).operations["widgets.list"]!;

    expect(operation.inputSchema.properties).toEqual({
      accountId: { type: "string", description: "Operation account." },
      workspaceId: { type: "string", description: "Workspace identifier." },
      trace: { type: "string", description: "Operation trace query." },
      limit: { type: "integer", description: "Operation limit." },
      requestId: { type: "string", description: "Request identifier." },
    });
    expect(operation.inputSchema.required).toEqual(["accountId", "workspaceId", "trace", "limit", "requestId"]);
    expect(operation.request.path).toBe("/accounts/{{accountId}}/widgets");
    expect(operation.request.query).toEqual({ workspaceId: "{{workspaceId}}", limit: "{{limit}}", trace: "{{trace}}" });
    expect(operation.request.headers).toEqual({ trace: "{{trace}}", requestId: "{{requestId}}" });
  });

  it("resolves a $ref request body into input properties and a body template", () => {
    const operation = generateManifest(spec, options).operations["contacts.create"]!;
    expect(operation.sideEffect).toBe("write");
    expect(Object.keys(operation.inputSchema.properties).sort()).toEqual(["email", "name", "tags"]);
    expect(operation.inputSchema.required).toEqual(["email"]);
    expect(operation.request.body).toEqual({ email: "{{email}}", name: "{{name}}", tags: "{{tags}}" });
    expect(operation.request.success).toEqual([201]);
  });

  it("derives the output schema from the 2xx response body", () => {
    const operation = generateManifest(spec, options).operations["contacts.list"]!;
    expect(operation.outputSchema.properties.data.properties.data.type).toBe("array");
  });

  it("carries a 204 response through as a success status", () => {
    const operation = generateManifest(spec, options).operations["contacts.delete"]!;
    expect(operation.request.success).toEqual([204]);
  });

  it("applies the declared byte and timeout limits to every operation", () => {
    const manifest = generateManifest(spec, { ...options, timeoutMs: 12000, maxInputBytes: 4096, maxResponseBytes: 65536 });
    for (const operation of Object.values(manifest.operations)) {
      expect(operation.timeoutMs).toBe(12000);
      expect(operation.maxInputBytes).toBe(4096);
      expect(operation.maxResponseBytes).toBe(65536);
    }
  });

  it("disambiguates two operations that derive the same key", () => {
    const collide = {
      ...spec,
      paths: {
        "/contacts": { get: { tags: ["Contacts"], summary: "A", responses: { "200": { description: "ok" } } } },
        "/contacts/search": { get: { tags: ["Contacts"], summary: "B", responses: { "200": { description: "ok" } } } },
      },
    };
    const keys = Object.keys(generateManifest(collide, options).operations).sort();
    expect(keys).toEqual(["contacts.list", "contacts.list-search"]);
  });

  it("skips an operation with no documented success response", () => {
    const noSuccess = {
      ...spec,
      paths: { "/contacts": { get: { tags: ["Contacts"], summary: "A", responses: { "500": { description: "boom" } } } } },
    };
    expect(Object.keys(generateManifest(noSuccess, options).operations)).toEqual([]);
  });

  it("rejects a spec with no server URL rather than guessing one", () => {
    expect(() => generateManifest({ ...spec, servers: [] }, options)).toThrow("spec declares no server URL");
  });

  it("guards against a self-referencing schema", () => {
    const cyclic = {
      ...spec,
      paths: {
        "/nodes": {
          post: {
            tags: ["Nodes"],
            summary: "Create node",
            requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/Node" } } } },
            responses: { "200": { description: "ok" } },
          },
        },
      },
      components: { schemas: { Node: { type: "object", properties: { id: { type: "string" }, child: { $ref: "#/components/schemas/Node" } } } } },
    };
    const operation = generateManifest(cyclic, options).operations["nodes.create"]!;
    expect(Object.keys(operation.inputSchema.properties).sort()).toEqual(["child", "id"]);
  });
});
