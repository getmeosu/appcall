import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

describe("eversign contract", () => {
  test("uses the access_key query parameter on api.eversign.com", () => {
    expect(manifest.network.allowedHosts).toEqual(["api.eversign.com"]);
    expect(manifest.http.baseUrl).toBe("https://api.eversign.com");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "query",
      name: "access_key",
      value: "{{apiKey}}",
    });
    expect(manifest.auth.setup.fields.map((field: { key: string }) => field.key)).toEqual(["apiKey"]);
    expect(JSON.stringify(manifest.http)).not.toContain("Bearer");
    expect(JSON.stringify(manifest.http.baseUrl)).not.toContain("{{");
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("lists businesses without a business id and wraps the JSON array", async () => {
    const { actions } = compileDeclarativeConnector(manifest as never);
    const seen: Request[] = [];
    const result = await actions["businesses.list"]!({
      apiKey: "secret-access-key",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response([{ business_id: 1, business_name: "Primary", is_primary: 1 }]);
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("GET");
    expect(seen[0].headers.get("authorization")).toBeNull();
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(seen[0].headers.get("accept")).toBe("application/json");
    const url = new URL(seen[0].url);
    expect(url.origin + url.pathname).toBe("https://api.eversign.com/business");
    expect(url.searchParams.get("access_key")).toBe("secret-access-key");
    expect(url.searchParams.has("business_id")).toBe(false);
    expect(result.data).toEqual([{ business_id: 1, business_name: "Primary", is_primary: 1 }]);
  });

  test("lists documents with documented query parameters only", async () => {
    const { actions } = compileDeclarativeConnector(manifest as never);
    const seen: Request[] = [];
    await actions["documents.list"]!({
      apiKey: "secret-access-key",
      business_id: 7,
      type: "completed",
      limit: 10,
      page: 2,
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response([{ document_hash: "j6yMcaF2gQBIIS" }]);
      },
    });
    const url = new URL(seen[0].url);
    expect(url.pathname).toBe("/document");
    expect(url.searchParams.get("type")).toBe("completed");
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("business_id")).toBe("7");
    expect(url.searchParams.get("access_key")).toBe("secret-access-key");
    expect(url.searchParams.has("per_page")).toBe(false);
    expect(url.searchParams.has("signer_email")).toBe(false);
    expect(seen[0].headers.get("content-type")).toBeNull();
  });

  test("encodes the audit log hash and does not follow another host", async () => {
    const { actions } = compileDeclarativeConnector(manifest as never);
    const seen: Request[] = [];
    const result = await actions["documents.audit-log"]!({
      apiKey: "secret-access-key",
      business_id: 1,
      document_hash: "doc/a",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response([{ entry_id: 202201, event_type: "document_viewed" }]);
      },
    });
    const url = new URL(seen[0].url);
    expect(url.origin).toBe("https://api.eversign.com");
    expect(url.pathname).toBe("/document/doc%2Fa/audit_log");
    expect(result.data).toHaveLength(1);
    expect(seen).toHaveLength(1);
  });

  test("creates a document as one JSON POST and pins template creation", async () => {
    const { actions } = compileDeclarativeConnector(manifest as never);
    const seen: Request[] = [];
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Request(input, init));
      return response({ document_hash: "j6yMcaF2gQBIIS", is_template: 0 });
    };
    await actions["documents.create"]!({
      apiKey: "secret-access-key",
      business_id: 1,
      title: "Sample Document",
      sandbox: 0,
      template_id: "tplhash123",
      signers: [{ id: 1, name: "Paul McSign", email: "paul@example.com" }],
      fetch,
    });
    expect(seen[0].method).toBe("POST");
    expect(new URL(seen[0].url).pathname).toBe("/document");
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(seen[0].headers.get("authorization")).toBeNull();
    expect(await seen[0].text()).toBe(
      '{"sandbox":0,"title":"Sample Document","template_id":"tplhash123","signers":[{"id":1,"name":"Paul McSign","email":"paul@example.com"}]}',
    );
    seen.length = 0;
    await actions["templates.create"]!({
      apiKey: "secret-access-key",
      business_id: 1,
      title: "Client agreement",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({ document_hash: "tplhash123", is_template: 1 });
      },
    });
    expect(await seen[0].text()).toBe('{"is_template":1,"title":"Client agreement"}');
  });

  test("deletes with one body-less DELETE and optional cancel flag", async () => {
    const { actions } = compileDeclarativeConnector(manifest as never);
    const seen: Request[] = [];
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Request(input, init));
      return response({ success: true });
    };
    const result = await actions["documents.delete"]!({
      apiKey: "secret-access-key",
      business_id: 1,
      document_hash: "j6yMcaF2gQBIIS",
      fetch,
    });
    expect(seen[0].method).toBe("DELETE");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(await seen[0].text()).toBe("");
    const plain = new URL(seen[0].url);
    expect(plain.pathname).toBe("/document");
    expect(plain.searchParams.get("document_hash")).toBe("j6yMcaF2gQBIIS");
    expect(plain.searchParams.has("cancel")).toBe(false);
    expect(plain.searchParams.has("trash")).toBe(false);
    expect(result.data.success).toBe(true);
    seen.length = 0;
    await actions["documents.delete"]!({
      apiKey: "secret-access-key",
      business_id: 1,
      document_hash: "j6yMcaF2gQBIIS",
      cancel: 1,
      fetch,
    });
    expect(new URL(seen[0].url).searchParams.get("cancel")).toBe("1");
    expect(new URL(seen[0].url).searchParams.has("trash")).toBe(false);
  });

  test("reads bulk job status as JSON on the documented path", async () => {
    const { actions } = compileDeclarativeConnector(manifest as never);
    const seen: Request[] = [];
    const result = await actions["bulk-jobs.status"]!({
      apiKey: "secret-access-key",
      business_id: 139,
      bulk_job_id: 21,
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({ document_count: 14, completed_documents: 11 });
      },
    });
    const url = new URL(seen[0].url);
    expect(url.pathname).toBe("/bulk_job/21/status");
    expect(url.searchParams.get("business_id")).toBe("139");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(result.data.completed_documents).toBe(11);
  });

  test("rejects invalid input, an error object, a bad key, and a rate limit", async () => {
    const { actions } = compileDeclarativeConnector(manifest as never);
    await expect(actions["documents.create"]!({
      apiKey: "secret-access-key",
      business_id: 1,
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["businesses.list"]!({
      apiKey: "secret-access-key",
      extra: true,
      fetch: async () => response([]),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["documents.create"]!({
      apiKey: "secret-access-key",
      business_id: 1,
      signers: [{ id: 1, name: "Paul McSign", email: "paul@example.com" }],
      fetch: async () => response({ success: false, error: { type: "missing_signers", info: "Signers are required." } }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["businesses.list"]!({
      apiKey: "secret-access-key",
      fetch: async () => response({ success: false, error: { type: "invalid_access_key", info: "Invalid access key." } }, 401),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["businesses.list"]!({
      apiKey: "secret-access-key",
      fetch: async () => response({}, 429, { "Retry-After": "4" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
