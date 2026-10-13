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
  inputSchema?: { type?: string; additionalProperties?: boolean; required?: string[]; properties?: Record<string, unknown> };
  outputSchema?: { type?: string };
  request?: {
    method?: string;
    path?: string;
    baseUrl?: string;
    body?: unknown;
    bodyEncoding?: string;
    headers?: Record<string, string>;
    success?: number[];
  };
}>;

const DOC = "5e6665b0-c276-494f-abfc-01e7b1151461";
const webhook = {
  id: "23",
  name: "Hook",
  url: "https://hooks.example.test/cloudpdf",
  enabled: true,
  headers: {},
  events: [],
};

const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });

describe("CloudPDF contract", () => {
  test("uses the simple API key on the documented host", () => {
    expect(manifest.network.allowedHosts).toEqual(["api.cloudpdf.io"]);
    expect(manifest.http.baseUrl).toBe("https://api.cloudpdf.io/v2");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "X-Authorization",
      value: "{{apiKey}}",
    });
    expect(JSON.stringify(manifest.http.auth)).not.toContain("Bearer");
    expect(JSON.stringify(manifest)).not.toContain("signingSecret");
    expect(Object.keys(manifest.operations)).toHaveLength(10);
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
      expect(operation.inputSchema?.properties?.url === undefined || name.startsWith("webhooks."), name).toBe(true);
      expect(operation.timeoutMs, name).toBeGreaterThanOrEqual(1);
      expect(operation.timeoutMs, name).toBeLessThanOrEqual(300000);
      expect(operation.maxInputBytes, name).toBeLessThanOrEqual(26214400);
      expect(operation.maxResponseBytes, name).toBeGreaterThanOrEqual(operation.maxInputBytes ?? 0);
      const request = operation.request;
      expect(request?.method, name).toBeString();
      expect(request?.baseUrl, name).toBeUndefined();
      expect(request?.bodyEncoding, name).toBeUndefined();
      expect(String(request?.path ?? "").startsWith("/"), name).toBe(true);
      expect(String(request?.path ?? "").includes("http"), name).toBe(false);
      expect(request?.success, name).toEqual([200]);
      expect(request?.success, name).not.toContain(204);
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

  test("reads the account with the raw X-Authorization key and no body", async () => {
    const seen: Request[] = [];
    const result = await actions["account.get"]!({
      apiKey: "secret",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ organizationName: "ACME Company LTD", plan: "Professional" });
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("GET");
    expect(seen[0].url).toBe("https://api.cloudpdf.io/v2/account");
    expect(seen[0].headers.get("x-authorization")).toBe("secret");
    expect(seen[0].headers.get("accept")).toBe("application/json");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(seen[0].body).toBeNull();
    expect(result).toMatchObject({
      connector: "cloud-pdf",
      action: "account.get",
      source: "provider",
      data: { organizationName: "ACME Company LTD", plan: "Professional" },
    });
  });

  test("stores a callback URL in JSON and does not request it or a file URL", async () => {
    const seen: Request[] = [];
    const created = await actions["webhooks.create"]!({
      apiKey: "secret",
      name: "Hook",
      url: "https://evil.example/hook",
      events: [],
      headers: {},
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response(webhook);
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("POST");
    expect(new URL(seen[0].url).hostname).toBe("api.cloudpdf.io");
    expect(new URL(seen[0].url).pathname).toBe("/v2/webhooks");
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(await seen[0].text()).toBe('{"name":"Hook","url":"https://evil.example/hook","events":[],"headers":{}}');
    expect(created).toMatchObject({ connector: "cloud-pdf", action: "webhooks.create", source: "provider", data: webhook });

    const fileSeen: Request[] = [];
    const file = await actions["documents.files.get"]!({
      apiKey: "secret",
      documentId: DOC,
      fileId: "804ac929-7c46-404f-a166-72c6b3cea049",
      fetch: async (input, init) => {
        fileSeen.push(new Request(input, init));
        return response({
          id: "804ac929-7c46-404f-a166-72c6b3cea049",
          status: "Completed",
          uploadUrl: "https://files.example.test/804ac929.pdf",
          size: 1200,
        });
      },
    });
    expect(fileSeen).toHaveLength(1);
    expect(fileSeen[0].method).toBe("GET");
    expect(new URL(fileSeen[0].url).hostname).toBe("api.cloudpdf.io");
    expect(fileSeen[0].body).toBeNull();
    expect(file).toMatchObject({ action: "documents.files.get", data: { status: "Completed" } });
  });

  test("encodes path ids, omits unset JSON fields, and wraps the webhook array", async () => {
    const seen: Request[] = [];
    await actions["documents.delete"]!({
      apiKey: "secret",
      documentId: "id/with space",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ deletionTime: 1710000000 });
      },
    });
    expect(seen[0].method).toBe("DELETE");
    expect(new URL(seen[0].url).pathname).toBe("/v2/documents/id%2Fwith%20space");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(seen[0].body).toBeNull();

    const updated: Request[] = [];
    await actions["documents.update"]!({
      apiKey: "secret",
      documentId: DOC,
      name: "renamed.pdf",
      fetch: async (input, init) => {
        updated.push(new Request(input, init));
        return response({ id: DOC, name: "renamed.pdf" });
      },
    });
    expect(updated[0].method).toBe("PUT");
    expect(await updated[0].text()).toBe('{"name":"renamed.pdf"}');

    const listed: Request[] = [];
    const list = await actions["webhooks.list"]!({
      apiKey: "secret",
      fetch: async (input, init) => {
        listed.push(new Request(input, init));
        return response([webhook]);
      },
    });
    expect(listed[0].url).toBe("https://api.cloudpdf.io/v2/webhooks");
    expect(listed[0].body).toBeNull();
    expect(list).toMatchObject({ action: "webhooks.list", source: "provider", data: [webhook] });
  });

  test("rejects free-form hosts, bad input, non-JSON success, upstream failure, and rate limits", async () => {
    await expect(actions["documents.get"]!({ apiKey: "secret", documentId: "", fetch: async () => response({}) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["documents.get"]!({ apiKey: "secret", documentId: "..", fetch: async () => response({}) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["documents.get"]!({ apiKey: "secret", documentId: DOC, url: "https://evil.example", fetch: async () => response({}) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["documents.update"]!({ apiKey: "secret", documentId: DOC, clear_description: true, fetch: async () => response({}) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["webhooks.create"]!({ apiKey: "secret", name: "Hook", fetch: async () => response(webhook) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["webhooks.create"]!({ apiKey: "secret", name: "Hook", url: "https://hooks.example.test/c", events: ["nope"], fetch: async () => response(webhook) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["documents.update"]!({ apiKey: "secret", documentId: DOC, defaultPermissions: { download: "Yes" }, fetch: async () => response({}) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["account.get"]!({ apiKey: "secret", fetch: async () => response("OK") })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["account.get"]!({ apiKey: "secret", fetch: async () => new Response("", { status: 200 }) })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["documents.get"]!({ apiKey: "secret", documentId: DOC, fetch: async () => response([]) })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["webhooks.list"]!({ apiKey: "secret", fetch: async () => response({ data: [] }) })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["documents.delete"]!({ apiKey: "secret", documentId: DOC, fetch: async () => response({ code: "unauthorized" }, 401) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["webhooks.delete"]!({ apiKey: "secret", webhookId: "23", fetch: async () => response({}, 429, { "Retry-After": "4" }) })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
