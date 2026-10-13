import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import coverage from "../../contractbook.coverage.json";

const { actions } = compileDeclarativeConnector(manifest);
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

const live = [
  "CONTRACTBOOK_CREATE_DOCUMENT_FROM_TEMPLATE",
  "CONTRACTBOOK_DELETE_DOCUMENT",
  "CONTRACTBOOK_GET_DOCUMENT",
  "CONTRACTBOOK_GET_DOCUMENT_PDF_LINK",
  "CONTRACTBOOK_GET_TEMPLATE",
  "CONTRACTBOOK_LIST_AUTOMATIONS",
  "CONTRACTBOOK_LIST_DOCUMENTS",
  "CONTRACTBOOK_LIST_TEMPLATES",
  "CONTRACTBOOK_UPDATE_DOCUMENT",
];

describe("Contractbook contract", () => {
  test("maps every live tool to one JSON route or a missing_still reason", () => {
    const mapped = coverage.mapped.map((row: { tool: string }) => row.tool);
    const missing = coverage.missing_still.map((row: { tool: string; reason: string }) => row.tool);
    expect(coverage.missing_http).toEqual([]);
    expect(coverage.full_depth).toBe(true);
    expect([...mapped, ...missing].sort()).toEqual([...live].sort());
    expect(mapped.length + missing.length).toBe(live.length);
    for (const row of coverage.mapped) {
      const operation = manifest.operations[row.operation];
      expect(operation?.request?.method, row.tool).toBe(row.method);
      expect(operation?.request?.path, row.tool).toBe(row.path);
      expect(actions[row.operation], row.tool).toBeTypeOf("function");
    }
    for (const row of coverage.missing_still) {
      expect(row.reason.length, row.tool).toBeGreaterThan(0);
    }
    expect(actions["documents.delete"]).toBeUndefined();
    expect(actions["documents.pdf-link"]).toBeUndefined();
  });

  test("lists documents with bearer auth, exploded filters, and no body", async () => {
    const seen: { url: string; method: string; body: unknown; headers: Headers }[] = [];
    const result = await actions["documents.list"]!({
      apiKey: "secret",
      title: "nda",
      full: true,
      pageSize: 25,
      contexts: ["my_documents", "workspace"],
      sortColumn: "updated_at",
      sortDirection: "desc",
      fetch: async (input: unknown, init: { method?: string; body?: unknown; headers?: HeadersInit }) => {
        seen.push({
          url: String(input),
          method: String(init?.method),
          body: init?.body,
          headers: new Headers(init?.headers),
        });
        return response({ documents: [{ id: "6b6314b6-56f9-4454-869a-84c96682cea9" }], pagination_meta: { cursor: "next-1" } });
      },
    });
    const url = new URL(seen[0].url);
    expect(seen).toHaveLength(1);
    expect(url.hostname).toBe("api.contractbook.com");
    expect(url.pathname).toBe("/v3/documents");
    expect(url.searchParams.getAll("context[]")).toEqual(["my_documents", "workspace"]);
    expect(url.searchParams.get("full")).toBe("true");
    expect(url.searchParams.get("title")).toBe("nda");
    expect(url.searchParams.get("page_size")).toBe("25");
    expect(url.searchParams.get("sort_column")).toBe("updated_at");
    expect(url.searchParams.get("sort_direction")).toBe("desc");
    expect(url.searchParams.get("states[]")).toBeNull();
    expect(seen[0].method).toBe("GET");
    expect(seen[0].body ?? null).toBeNull();
    expect(seen[0].headers.get("authorization")).toBe("Bearer secret");
    expect(seen[0].headers.get("accept")).toBe("application/json");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(result.data.documents).toHaveLength(1);
  });

  test("encodes a document id and does not follow a URL in the document", async () => {
    const seen: string[] = [];
    const result = await actions["documents.get"]!({
      apiKey: "secret",
      documentId: "doc/1",
      fetch: async (input: unknown) => {
        seen.push(String(input));
        return response({ document: { id: "doc/1", company_logo_url: "https://evil.example/logo.png" } });
      },
    });
    const url = new URL(seen[0]);
    expect(url.hostname).toBe("api.contractbook.com");
    expect(url.pathname).toBe("/v3/documents/doc%2F1");
    expect(result.data.document.company_logo_url).toBe("https://evil.example/logo.png");
    expect(seen).toHaveLength(1);
  });

  test("posts a JSON document object when creating from a template", async () => {
    const seen: { url: string; body: unknown; headers: Headers }[] = [];
    await actions["documents.create-from-template"]!({
      apiKey: "secret",
      templateId: "1e013958-867e-43fb-8210-c98ab139beb6",
      title: "Fixture draft",
      message: { content: "Please sign" },
      toBeSignedBy: "owner_and_others",
      fetch: async (input: unknown, init: { body?: unknown; headers?: HeadersInit }) => {
        seen.push({ url: String(input), body: init?.body, headers: new Headers(init?.headers) });
        return response({ document: { id: "6b6314b6-56f9-4454-869a-84c96682cea9", title: "Fixture draft" } }, 201);
      },
    });
    expect(new URL(seen[0].url).pathname).toBe("/v3/templates/1e013958-867e-43fb-8210-c98ab139beb6/create_document");
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(seen[0].body).toBe(
      "{\"document\":{\"title\":\"Fixture draft\",\"message\":{\"content\":\"Please sign\"},\"to_be_signed_by\":\"owner_and_others\"}}",
    );
  });

  test("validates input, malformed output, 401 and 429", async () => {
    await expect(actions["documents.get"]!({
      apiKey: "secret",
      documentId: "",
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["documents.update"]!({
      apiKey: "secret",
      documentId: "6b6314b6-56f9-4454-869a-84c96682cea9",
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["documents.list"]!({
      apiKey: "secret",
      fetch: async () => response([]),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["documents.list"]!({
      apiKey: "secret",
      fetch: async () => response({ error: { type: "unauthorized", message: "Unauthorized" } }, 401),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["documents.list"]!({
      apiKey: "secret",
      fetch: async () => response({}, 429, { "Retry-After": "4" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
