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
  inputSchema?: { type?: string; additionalProperties?: boolean; properties?: Record<string, unknown> };
  outputSchema?: { type?: string };
  request?: { method?: string; path?: string; baseUrl?: string; body?: unknown; headers?: Record<string, string> };
}>;

const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });

const blockedUrlKeys = ["document_url", "callback_url", "documentUrl", "callbackUrl", "baseurl", "http_proxy", "referrer"];

function walkKeys(value: unknown, found: string[] = []): string[] {
  if (!value || typeof value !== "object") return found;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    found.push(key);
    walkKeys(child, found);
  }
  return found;
}

describe("DocRaptor contract", () => {
  test("uses HTTP basic auth with an empty password on the documented hosts", () => {
    expect(manifest.network.allowedHosts).toEqual(["api.docraptor.com", "docraptor.com"]);
    expect(manifest.http.baseUrl).toBe("https://api.docraptor.com");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "Authorization",
      basic: { username: "{{apiKey}}", password: "" },
    });
    expect(JSON.stringify(manifest.http.auth)).not.toContain("user_credentials");
  });

  test("keeps one JSON route per action inside the declarative budgets", () => {
    const keys = walkKeys(manifest.operations);
    for (const blocked of blockedUrlKeys) expect(keys, blocked).not.toContain(blocked);
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
    }
    expect(operations["docs.create-async"]?.request?.path).toBe("/async_docs");
    expect(operations["docs.create-hosted-async"]?.request?.path).toBe("/hosted_async_docs");
    expect(operations["docs.status"]?.request?.baseUrl).toBe("https://docraptor.com");
    expect(operations["ips.list"]?.request?.baseUrl).toBe("https://docraptor.com");
  });

  test("sends basic auth, encodes the status id, and does not follow download_url", async () => {
    const seen: Request[] = [];
    const result = await actions["docs.status"]!({
      apiKey: "fixture-api-token",
      statusId: "id/a",
      fetch: async (input: string | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({
          status: "completed",
          download_url: "https://evil.example/download/secret",
          download_id: "secret",
          number_of_pages: 1,
        });
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].headers.get("authorization")).toBe("Basic Zml4dHVyZS1hcGktdG9rZW46");
    expect(new URL(seen[0].url).pathname).toBe("/status/id%2Fa");
    expect(seen[0].url).not.toContain("user_credentials");
    expect(result).toMatchObject({ download_url: "https://evil.example/download/secret" });
  });

  test("rejects a free-form URL, malformed output, 401, and 429", async () => {
    await expect(actions["docs.create-async"]!({
      apiKey: "fixture-api-token",
      name: "Invoice",
      documentType: "pdf",
      documentContent: "<html></html>",
      documentUrl: "https://evil.example/page",
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["docs.create-async"]!({
      apiKey: "fixture-api-token",
      name: "",
      documentType: "pdf",
      documentContent: "<html></html>",
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["docs.list"]!({
      apiKey: "fixture-api-token",
      fetch: async () => response({ documents: [] }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["ips.list"]!({
      apiKey: "fixture-api-token",
      fetch: async () => response("<errors><error>no</error></errors>", 401, { "content-type": "application/xml" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["ips.list"]!({
      apiKey: "fixture-api-token",
      fetch: async () => response({}, 429, { "Retry-After": "4" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });

  test("passes prince media through as JSON and omits absent optional fields", async () => {
    const seen: Array<{ url: string; body: string | null }> = [];
    await actions["docs.create-async"]!({
      apiKey: "fixture-api-token",
      name: "Styled",
      documentType: "pdf",
      documentContent: "<html><body>Styled</body></html>",
      princeOptions: { media: "screen" },
      fetch: async (input: string | URL, init?: RequestInit) => {
        seen.push({ url: String(input), body: init?.body == null ? null : String(init.body) });
        return response({ status_id: "styled-1" });
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe("https://api.docraptor.com/async_docs");
    expect(JSON.parse(seen[0].body ?? "")).toEqual({
      type: "pdf",
      name: "Styled",
      document_content: "<html><body>Styled</body></html>",
      prince_options: { media: "screen" },
    });
    await expect(actions["docs.create-hosted-async"]!({
      apiKey: "fixture-api-token",
      name: "Hosted",
      documentType: "pdf",
      documentContent: "<html></html>",
      princeOptions: { baseurl: "https://evil.example" },
      fetch: async () => response({ status_id: "nope" }),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
  });
});
