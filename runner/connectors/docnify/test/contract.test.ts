import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import coverage from "../../docnify.coverage.json";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, any>>;
const { actions } = compileDeclarativeConnector(manifest as never);
const liveTools = [
  "DOCNIFY_ADD_DOCUMENT_RECIPIENT",
  "DOCNIFY_CREATE_DOCUMENT_FIELDS",
  "DOCNIFY_DELETE_DOCUMENT",
  "DOCNIFY_DELETE_DOCUMENT_FIELDS",
  "DOCNIFY_DELETE_DOCUMENT_RECIPIENT",
  "DOCNIFY_GET_DOCUMENT",
  "DOCNIFY_GET_TEMPLATE",
  "DOCNIFY_LIST_DOCUMENTS",
  "DOCNIFY_LIST_TEMPLATES",
  "DOCNIFY_RESEND_DOCUMENT",
  "DOCNIFY_SEND_DOCUMENT",
  "DOCNIFY_UPDATE_DOCUMENT_FIELDS",
  "DOCNIFY_UPDATE_DOCUMENT_RECIPIENT",
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("Docnify contract", () => {
  test("maps every live tool to one JSON route", () => {
    const mapped = coverage.mapped.map((row) => row.tool);
    const missing = coverage.missing_still.map((row) => row.tool);
    expect(coverage.missing_http).toEqual([]);
    expect(coverage.missing_still).toEqual([]);
    expect([...mapped, ...missing].sort()).toEqual([...liveTools].sort());
    expect(mapped.length + missing.length).toBe(liveTools.length);
    expect(coverage.composio_tools).toBe(liveTools.length);
    expect(coverage.index_tools).toBe(13);
    for (const row of coverage.mapped) {
      const operation = operations[row.operation];
      expect(operation?.request?.method, row.tool).toBe(row.method);
      expect(operation?.request?.path, row.tool).toBe(row.path);
      expect(typeof actions[row.operation], row.tool).toBe("function");
    }
  });

  test("keeps JSON bounds, body-less reads, and raw token auth on app.docnify.io", () => {
    expect(manifest.network.allowedHosts).toEqual(["app.docnify.io"]);
    expect(manifest.http.baseUrl).toBe("https://app.docnify.io/api/v1");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "Authorization",
      value: "{{apiKey}}",
    });
    for (const [name, operation] of Object.entries(operations)) {
      expect(operation.kind, name).toBe("action");
      expect(typeof operation.title, name).toBe("string");
      expect(typeof operation.description, name).toBe("string");
      expect(operation.inputSchema.type, name).toBe("object");
      expect(operation.outputSchema.type, name).toBe("object");
      expect(operation.responseFormat, name).toBe("json");
      expect(operation.request.baseUrl, name).toBeUndefined();
      expect(operation.maxResponseBytes, name).toBeGreaterThanOrEqual(operation.maxInputBytes);
      expect(operation.maxInputBytes, name).toBeLessThanOrEqual(26214400);
      expect(operation.timeoutMs, name).toBeGreaterThanOrEqual(1);
      expect(operation.timeoutMs, name).toBeLessThanOrEqual(300000);
      const method = operation.request.method;
      expect(["GET", "POST", "PATCH", "DELETE"].includes(method), name).toBe(true);
      if (method === "GET" || method === "DELETE") {
        expect(operation.request.body, name).toBeUndefined();
        expect(operation.request.headers?.["Content-Type"], name).toBeUndefined();
      } else {
        expect(operation.request.headers?.["Content-Type"], name).toBe("application/json");
        expect(operation.request.body, name).toBeDefined();
      }
    }
  });

  test("sends the raw API token, omits optional fields, and keeps the host fixed", async () => {
    const seen: Request[] = [];
    const fetch = async (input: string | URL, init?: RequestInit) => {
      seen.push(new Request(input, init));
      return json({ documents: [], totalPages: 0 });
    };
    await actions["documents.list"]!({ apiKey: "secret", fetch });
    expect(seen[0].headers.get("authorization")).toBe("secret");
    expect(seen[0].headers.get("authorization")).not.toContain("Bearer");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(await seen[0].text()).toBe("");
    expect(new URL(seen[0].url).hostname).toBe("app.docnify.io");
    expect(new URL(seen[0].url).pathname).toBe("/api/v1/documents");
    expect(new URL(seen[0].url).search).toBe("");

    seen.length = 0;
    await actions["documents.send"]!({
      apiKey: "secret",
      documentId: 42,
      sendEmail: false,
      fetch: async (input: string | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return json({ message: "Document sent for signing", id: 42, title: "Fixture agreement", status: "PENDING" });
      },
    });
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(await seen[0].text()).toBe('{"sendEmail":false}');
    expect(new URL(seen[0].url).pathname).toBe("/api/v1/documents/42/send");

    seen.length = 0;
    await actions["documents.fields.create"]!({
      apiKey: "secret",
      documentId: 42,
      fields: [{
        recipientId: 9,
        type: "SIGNATURE",
        pageNumber: 1,
        pageX: 10,
        pageY: 80,
        pageWidth: 30,
        pageHeight: 5,
        fieldMeta: { type: "signature" },
      }],
      fetch: async (input: string | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return json({ documentId: 42, fields: [] });
      },
    });
    expect(await seen[0].text()).toBe('[{"recipientId":9,"type":"SIGNATURE","pageNumber":1,"pageX":10,"pageY":80,"pageWidth":30,"pageHeight":5,"fieldMeta":{"type":"signature"}}]');
    expect(new URL(seen[0].url).hostname).toBe("app.docnify.io");
  });

  test("rejects bad input, dot segments, malformed JSON, and 401", async () => {
    const fetch = async () => json({});
    await expect(actions["documents.get"]!({ apiKey: "secret", documentId: 0, fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(actions["documents.list"]!({ apiKey: "secret", host: "https://evil.example", fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(actions["documents.delete"]!({ apiKey: "secret", documentId: ".." as never, fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(actions["documents.get"]!({
      apiKey: "secret",
      documentId: 42,
      fetch: async () => new Response("not-json", { status: 200, headers: { "content-type": "application/json" } }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["documents.get"]!({
      apiKey: "secret",
      documentId: 42,
      fetch: async () => json({ message: "Unauthorized" }, 401),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
