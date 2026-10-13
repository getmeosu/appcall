import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const operations = manifest.operations as Record<string, {
  kind?: string;
  sideEffect?: string;
  timeoutMs?: number;
  maxInputBytes?: number;
  maxResponseBytes?: number;
  title?: string;
  description?: string;
  responseFormat?: string;
  validationMode?: string;
  enforceOutputSchema?: boolean;
  inputSchema?: { type?: string; additionalProperties?: boolean };
  outputSchema?: { type?: string };
  request?: { method?: string; path?: string; body?: unknown; headers?: Record<string, string>; baseUrl?: string };
}>;

const asyncEnvelope = {
  status: "success",
  transaction_ref: "a0430897-2c94-40e1-a09b-57403d811ceb",
  is_async: true,
};

const fileEnvelope = {
  status: "success",
  file: "https://cdn.example/generated/output.pdf",
  transaction_ref: "a0430897-2c94-40e1-a09b-57403d811ceb",
};

const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });

describe("CraftMyPDF contract", () => {
  test("uses the X-API-KEY header on the default documented host", () => {
    expect(manifest.network.allowedHosts).toEqual(["api.craftmypdf.com"]);
    expect(manifest.http.baseUrl).toBe("https://api.craftmypdf.com/v1");
    expect(manifest.http.baseUrl).not.toContain("{{");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "X-API-KEY",
      value: "{{apiKey}}",
    });
    expect(JSON.stringify(manifest.http.auth)).not.toContain("Bearer");
    expect(JSON.stringify(manifest.network.allowedHosts)).not.toContain("{{");
  });

  test("keeps one JSON route per action inside the declarative budgets", () => {
    const httpHeaders = (manifest.http.headers ?? {}) as Record<string, string>;
    expect(httpHeaders["Content-Type"] ?? httpHeaders["content-type"]).toBeUndefined();
    const paths = new Set<string>();
    for (const [name, operation] of Object.entries(operations)) {
      expect(operation.kind, name).toBe("action");
      expect(operation.title, name).toBeString();
      expect(operation.description, name).toBeString();
      expect(operation.responseFormat, name).toBe("json");
      expect(operation.validationMode, name).toBe("strict-generated");
      expect(operation.enforceOutputSchema, name).toBe(true);
      expect(operation.outputSchema?.type, name).toBe("object");
      expect(operation.inputSchema?.type, name).toBe("object");
      expect(operation.inputSchema?.additionalProperties, name).toBe(false);
      expect(operation.timeoutMs, name).toBeGreaterThanOrEqual(1);
      expect(operation.timeoutMs, name).toBeLessThanOrEqual(300000);
      expect(operation.maxInputBytes, name).toBeLessThanOrEqual(26214400);
      expect(operation.maxResponseBytes, name).toBeGreaterThanOrEqual(operation.maxInputBytes ?? 0);
      const request = operation.request;
      expect(request?.baseUrl, name).toBeUndefined();
      expect(request?.method, name).toBeString();
      expect(String(request?.path ?? "").startsWith("/"), name).toBe(true);
      expect(String(request?.path ?? "").includes("http"), name).toBe(false);
      const route = `${request?.method} ${request?.path}`;
      expect(paths.has(route), name).toBe(false);
      paths.add(route);
      if (request?.method === "GET" || request?.method === "DELETE") {
        expect(request.body, name).toBeUndefined();
        expect(request.headers?.["Content-Type"] ?? request.headers?.["content-type"], name).toBeUndefined();
      }
      if (request?.body !== undefined) {
        expect(request.headers?.["Content-Type"], name).toBe("application/json");
      }
      if (name.startsWith("webhook.")) expect(operation.sideEffect, name).toBe("read");
    }
    expect(paths.size).toBe(12);
  });

  test("sends async template data as JSON and does not call the webhook or file URL", async () => {
    const seen: Request[] = [];
    const result = await actions["pdf.create-async"]!({
      apiKey: "secret",
      template_id: "05f77b2b18ad809a",
      data: { invoice_number: "INV38379" },
      webhook_url: "https://hooks.example/pdf",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response(asyncEnvelope);
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("POST");
    expect(seen[0].url).toBe("https://api.craftmypdf.com/v1/create-async");
    expect(new URL(seen[0].url).hostname).toBe("api.craftmypdf.com");
    expect(seen[0].headers.get("x-api-key")).toBe("secret");
    expect(seen[0].headers.get("authorization")).toBeNull();
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(await seen[0].text()).toBe(
      "{\"data\":{\"invoice_number\":\"INV38379\"},\"template_id\":\"05f77b2b18ad809a\",\"webhook_url\":\"https://hooks.example/pdf\"}",
    );
    expect(result).toMatchObject({
      connector: "craftmypdf",
      action: "pdf.create-async",
      source: "provider",
      data: asyncEnvelope,
    });
  });

  test("passes a PDF url as a query parameter and keeps the host fixed", async () => {
    const seen: Request[] = [];
    await actions["pdf.get-info"]!({
      apiKey: "secret",
      pdf_url: "https://cdn.example/sample.pdf",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ status: "success", totalPages: 1, url: "https://cdn.example/sample.pdf" });
      },
    });
    expect(seen).toHaveLength(1);
    const url = new URL(seen[0].url);
    expect(url.hostname).toBe("api.craftmypdf.com");
    expect(url.pathname).toBe("/v1/get-pdf-info");
    expect(url.searchParams.get("url")).toBe("https://cdn.example/sample.pdf");
    expect(seen[0].method).toBe("GET");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(seen[0].body).toBeNull();
  });

  test("keeps page placeholders inside the JSON body", async () => {
    const seen: Request[] = [];
    await actions["pdf.add-text"]!({
      apiKey: "secret",
      pdf_url: "https://cdn.example/sample.pdf",
      textSettings: [{ page_selector: "1-*", text: "Page {{pageNumber}} of {{totalPages}}", position: "bottom-center" }],
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response(fileEnvelope);
      },
    });
    expect(new URL(seen[0].url).hostname).toBe("api.craftmypdf.com");
    expect(await seen[0].text()).toContain("Page {{pageNumber}} of {{totalPages}}");
    expect(seen).toHaveLength(1);
  });

  test("rejects bad input, non-object JSON, upstream failure, and rate limits", async () => {
    await expect(actions["pdf.create-async"]!({ apiKey: "secret", template_id: "", data: {}, fetch: async () => response(asyncEnvelope) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["pdf.merge"]!({ apiKey: "secret", urls: [], fetch: async () => response(fileEnvelope) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["templates.list"]!({ apiKey: "secret", extra: true, fetch: async () => response({ status: "success", templates: [] }) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["account.get"]!({ apiKey: "secret", fetch: async () => response("OK") })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["account.get"]!({ apiKey: "secret", fetch: async () => response([]) })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["account.get"]!({ apiKey: "secret", fetch: async () => response({ status: "error", message: "Invalid API Key" }, 401) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["transactions.list"]!({ apiKey: "secret", fetch: async () => response({}, 429, { "Retry-After": "4" }) })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
