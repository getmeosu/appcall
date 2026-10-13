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
  inputSchema?: { type?: string; additionalProperties?: boolean; required?: string[] };
  outputSchema?: { type?: string };
  request?: { method?: string; path?: string; body?: unknown; headers?: Record<string, string>; success?: number[] };
}>;

const envelope = {
  FileUrl: "https://files.example/6e46637a-650d-46d5-af0b-3d7831baccbb",
  MbOut: 0.08,
  Cost: 0.0001,
  Seconds: 0.4,
  Success: true,
  Error: null,
  ResponseId: "6e46637a-650d-46d5-af0b-3d7831baccbb",
};

const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });

describe("API2PDF contract", () => {
  test("uses the raw Authorization key on the documented host", () => {
    expect(manifest.network.allowedHosts).toEqual(["v2.api2pdf.com"]);
    expect(manifest.http.baseUrl).toBe("https://v2.api2pdf.com");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "Authorization",
      value: "{{apiKey}}",
    });
    expect(JSON.stringify(manifest.http.auth)).not.toContain("Bearer");
  });

  test("keeps budgets, JSON bodies, and object outputs inside the declarative rules", () => {
    const httpHeaders = (manifest.http.headers ?? {}) as Record<string, string>;
    expect(httpHeaders["Content-Type"] ?? httpHeaders["content-type"]).toBeUndefined();
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
      expect(request?.method, name).toBeString();
      expect(String(request?.path ?? "").startsWith("/"), name).toBe(true);
      if (request?.method === "GET" || request?.method === "DELETE") {
        expect(request.body, name).toBeUndefined();
        expect(request.headers?.["Content-Type"] ?? request.headers?.["content-type"], name).toBeUndefined();
      }
      if (request?.body !== undefined) {
        expect(request.headers?.["Content-Type"], name).toBe("application/json");
      }
      if (name.startsWith("webhook.")) expect(operation.sideEffect, name).toBe("read");
    }
  });

  test("sends header and footer HTML to Chrome as JSON and does not follow the file URL", async () => {
    const seen: Request[] = [];
    const result = await actions["chrome.html-to-pdf"]!({
      apiKey: "secret",
      html: "<h1>Report</h1>",
      inline: false,
      inlinePdf: false,
      fileName: "report.pdf",
      options: { displayHeaderFooter: true, headerTemplate: "<span>Header</span>", footerTemplate: "<span>Footer</span>" },
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response(envelope);
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("POST");
    expect(seen[0].url).toBe("https://v2.api2pdf.com/chrome/pdf/html");
    expect(seen[0].headers.get("authorization")).toBe("secret");
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(await seen[0].text()).toBe(
      "{\"html\":\"<h1>Report</h1>\",\"inline\":false,\"inlinePdf\":false,\"fileName\":\"report.pdf\",\"options\":{\"displayHeaderFooter\":true,\"headerTemplate\":\"<span>Header</span>\",\"footerTemplate\":\"<span>Footer</span>\"}}",
    );
    expect(result).toMatchObject({ connector: "api2pdf", action: "chrome.html-to-pdf", source: "provider", data: envelope });
  });

  test("deletes by encoded response id with no body", async () => {
    const seen: Request[] = [];
    await actions["files.delete"]!({
      apiKey: "secret",
      responseId: "id/with space",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ Success: true, Error: null, ResponseId: "id/with space" });
      },
    });
    expect(seen[0].method).toBe("DELETE");
    expect(new URL(seen[0].url).pathname).toBe("/file/id%2Fwith%20space");
    expect(seen[0].headers.get("authorization")).toBe("secret");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(seen[0].body).toBeNull();
  });

  test("rejects bad input, non-JSON success, upstream failure, and rate limits", async () => {
    await expect(actions["chrome.html-to-pdf"]!({ apiKey: "secret", html: "", fetch: async () => response(envelope) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["pdf.merge"]!({ apiKey: "secret", urls: [], fetch: async () => response(envelope) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["pdf.extract-pages"]!({ apiKey: "secret", url: "https://example.com/a.pdf", extra: true, fetch: async () => response(envelope) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["pdf.compress"]!({ apiKey: "secret", url: "https://example.com/a.pdf", fetch: async () => response("OK") })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["pdf.compress"]!({ apiKey: "secret", url: "https://example.com/a.pdf", fetch: async () => response([]) })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["libreoffice.thumbnail"]!({ apiKey: "secret", url: "https://example.com/a.docx", fetch: async () => response({ Success: false, Error: "unreadable file" }) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["pdf.merge"]!({ apiKey: "secret", urls: ["https://example.com/a.pdf"], fetch: async () => response({ Error: "unauthorized" }, 401) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["files.delete"]!({ apiKey: "secret", responseId: "abc", fetch: async () => response({}, 429, { "Retry-After": "4" }) })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
