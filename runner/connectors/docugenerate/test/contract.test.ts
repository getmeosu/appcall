import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const routes = {
  "templates.list": { method: "GET", path: "/template", body: false, success: [200] },
  "templates.get": { method: "GET", path: "/template/{{templateId}}", body: false, success: [200] },
  "documents.list": { method: "GET", path: "/document", body: false, success: [200] },
  "documents.get": { method: "GET", path: "/document/{{documentId}}", body: false, success: [200] },
  "documents.generate": { method: "POST", path: "/document", body: true, success: [201] },
  "documents.update": { method: "PUT", path: "/document/{{documentId}}", body: true, success: [200] },
} as const;

const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

const templateRow = {
  id: "tpl_1",
  created: 1,
  updated: 1,
  name: "Invoice",
  page_count: 1,
  delimiters: { left: "[", right: "]" },
  tags: { valid: ["Name"], invalid: [] },
  filename: "Invoice.docx",
  format: ".docx",
  region: "us",
  template_uri: "https://storage.example/tpl_1.docx",
  preview_uri: "https://storage.example/tpl_1.pdf",
  image_uri: "https://storage.example/tpl_1.png",
  enhanced_syntax: false,
  versioning_enabled: false,
  folder: [],
};

const documentRow = {
  id: "doc_1",
  template_id: "tpl_1",
  created: 2,
  name: "Invoice",
  data_length: 1,
  filename: "Invoice.pdf",
  format: ".pdf",
  document_uri: "https://storage.example/doc_1.pdf",
};

type Seen = { url: string; method: string; headers: Headers; body: string | null };

async function call(action: string, input: Record<string, unknown>, body: unknown, status = 200) {
  const seen: Seen[] = [];
  const { actions } = compileDeclarativeConnector(manifest as never);
  const result = await actions[action]!({
    apiKey: "secret-token",
    ...input,
    fetch: async (inputInit: RequestInfo | URL, init?: RequestInit) => {
      seen.push({
        url: String(inputInit),
        method: String(init?.method ?? "GET"),
        headers: new Headers(init?.headers),
        body: init?.body == null ? null : String(init.body),
      });
      return response(body, status);
    },
  });
  return { seen, result };
}

describe("DocuGenerate contract", () => {
  test("uses the raw API key on the default OpenAPI host", () => {
    expect(manifest.key).toBe("docugenerate");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.network.allowedHosts).toEqual(["api.docugenerate.com"]);
    expect(manifest.http.baseUrl).toBe("https://api.docugenerate.com/v1");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "Authorization",
      value: "{{apiKey}}",
    });
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(JSON.stringify(manifest.http.headers)).not.toContain("Content-Type");
    expect(JSON.stringify(manifest.http.auth)).not.toContain("Bearer");
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
    expect(Object.keys(manifest.operations).sort()).toEqual(Object.keys(routes).sort());
  });

  test("maps each action to one JSON route with a bounded budget", () => {
    for (const [name, operation] of Object.entries(manifest.operations)) {
      const route = routes[name as keyof typeof routes];
      expect(operation.kind, name).toBe("action");
      expect(operation.title.length, name).toBeGreaterThan(0);
      expect(operation.description.length, name).toBeGreaterThan(0);
      expect(operation.timeoutMs, name).toBeGreaterThan(0);
      expect(operation.timeoutMs, name).toBeLessThanOrEqual(300000);
      expect(operation.maxInputBytes, name).toBeLessThanOrEqual(26214400);
      expect(operation.maxResponseBytes, name).toBeGreaterThanOrEqual(operation.maxInputBytes);
      expect(operation.inputSchema.type, name).toBe("object");
      expect(operation.inputSchema.additionalProperties, name).toBe(false);
      expect(operation.outputSchema.type, name).toBe("object");
      expect(operation.enforceOutputSchema, name).toBe(true);
      expect(operation.validationMode, name).toBe("strict-generated");
      expect(operation.responseFormat, name).toBe("json");
      expect(operation.request?.method, name).toBe(route.method);
      expect(operation.request?.path, name).toBe(route.path);
      expect(operation.request?.success, name).toEqual(route.success);
      expect(operation.request?.baseUrl, name).toBeUndefined();
      expect(JSON.stringify(operation)).not.toContain("multipart");
      if (route.body) {
        expect(operation.request?.headers, name).toEqual({ "Content-Type": "application/json" });
        expect(operation.request?.body, name).toBeDefined();
      } else {
        expect(operation.request?.body, name).toBeUndefined();
        expect(operation.request?.headers, name).toBeUndefined();
      }
    }
  });

  test("lists templates with the raw key and wraps the JSON array", async () => {
    const { seen, result } = await call("templates.list", {}, [templateRow]);
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("GET");
    expect(seen[0].headers.get("authorization")).toBe("secret-token");
    expect(seen[0].headers.get("accept")).toBe("application/json");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(seen[0].body).toBeNull();
    const url = new URL(seen[0].url);
    expect(url.origin).toBe("https://api.docugenerate.com");
    expect(url.pathname).toBe("/v1/template");
    expect(url.search).toBe("");
    expect(result.data).toEqual([templateRow]);
  });

  test("repeats the folder query and does not send page", async () => {
    expect(manifest.operations["templates.list"].inputSchema.properties.page).toBeUndefined();
    const { seen } = await call("templates.list", { folder: ["Legal", "Contracts"] }, [templateRow]);
    const url = new URL(seen[0].url);
    expect(url.pathname).toBe("/v1/template");
    expect(url.searchParams.getAll("folder")).toEqual(["Legal", "Contracts"]);
    expect(url.searchParams.has("page")).toBe(false);
    expect(url.searchParams.has("per_page")).toBe(false);
    expect(seen[0].body).toBeNull();
  });

  test("lists documents for one template id", async () => {
    const { seen, result } = await call("documents.list", { templateId: "tpl/1" }, [documentRow]);
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("GET");
    expect(seen[0].body).toBeNull();
    const url = new URL(seen[0].url);
    expect(url.pathname).toBe("/v1/document");
    expect(url.searchParams.get("template_id")).toBe("tpl/1");
    expect(result.data).toEqual([documentRow]);
  });

  test("encodes the document id and does not fetch document_uri", async () => {
    const { seen, result } = await call("documents.get", { documentId: "doc/a" }, documentRow);
    expect(seen).toHaveLength(1);
    expect(new URL(seen[0].url).pathname).toBe("/v1/document/doc%2Fa");
    expect(seen[0].body).toBeNull();
    expect(result.data.document_uri).toBe(documentRow.document_uri);
  });

  test("generates with one JSON body and returns the file URL", async () => {
    const { seen, result } = await call("documents.generate", {
      templateId: "tpl_1",
      data: { Name: "Ada" },
      name: "Invoice",
      outputName: "invoice",
      outputFormat: ".pdf",
      outputQuality: 80,
      singleFile: false,
      pageBreak: true,
    }, documentRow, 201);
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("POST");
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(seen[0].headers.get("accept")).toBe("application/json");
    expect(new URL(seen[0].url).pathname).toBe("/v1/document");
    expect(JSON.parse(seen[0].body ?? "")).toEqual({
      template_id: "tpl_1",
      data: { Name: "Ada" },
      name: "Invoice",
      output_name: "invoice",
      output_format: ".pdf",
      output_quality: 80,
      single_file: false,
      page_break: true,
    });
    expect(result.data.document_uri).toBe(documentRow.document_uri);
  });

  test("omits unset generate fields", async () => {
    const { seen } = await call("documents.generate", {
      templateId: "tpl_1",
      data: [{ Name: "Ada" }],
    }, documentRow, 201);
    expect(JSON.parse(seen[0].body ?? "")).toEqual({
      template_id: "tpl_1",
      data: [{ Name: "Ada" }],
    });
  });

  test("renames a document with one JSON body", async () => {
    const { seen } = await call("documents.update", {
      documentId: "doc/a",
      name: "Letter for Ada",
    }, { ...documentRow, name: "Letter for Ada" });
    expect(seen[0].method).toBe("PUT");
    expect(new URL(seen[0].url).pathname).toBe("/v1/document/doc%2Fa");
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(JSON.parse(seen[0].body ?? "")).toEqual({ name: "Letter for Ada" });
  });

  test("rejects a free-form URL, a file upload, bad output, 401, and 429", async () => {
    const { actions } = compileDeclarativeConnector(manifest as never);
    await expect(actions["documents.get"]!({
      apiKey: "secret-token",
      documentId: "doc_1",
      url: "https://evil.example",
      fetch: async () => response(documentRow),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["documents.generate"]!({
      apiKey: "secret-token",
      templateId: "tpl_1",
      data: { Name: "Ada" },
      file: { name: "data.xlsx" },
      fetch: async () => response(documentRow, 201),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["templates.list"]!({
      apiKey: "secret-token",
      fetch: async () => response({ data: {} }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["templates.list"]!({
      apiKey: "secret-token",
      fetch: async () => response({}, 401),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["templates.list"]!({
      apiKey: "secret-token",
      fetch: async () => response({}, 429, { "Retry-After": "4" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
