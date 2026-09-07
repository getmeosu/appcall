import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import recordFixture from "../fixtures/record.json";
import recordsListFixture from "../fixtures/records_list.json";
import notFoundFixture from "../fixtures/error_not_found.json";

const { actions } = compileDeclarativeConnector(manifest as never);

type Call = { url: string; init?: RequestInit };

function mockFetch(body: unknown, status = 200, headers: Record<string, string> = {}) {
  const calls: Call[] = [];
  const fetchFn = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(url), init });
    const payload = typeof body === "string" ? body : JSON.stringify(body);
    return new Response(payload, { status, headers: { "Content-Type": "application/json", ...headers } });
  };
  return { calls, fetchFn };
}

describe("airtable manifest compiles to handlers", () => {
  it("exposes one handler per declared action operation", () => {
    expect(Object.keys(actions).sort()).toEqual([
      "bases.list",
      "comments.create",
      "comments.list",
      "healthcheck",
      "records.create",
      "records.delete",
      "records.get",
      "records.list",
      "records.update",
      "tables.list",
    ]);
  });
});

describe("records.list", () => {
  it("returns the validated payload without a credential", () => {
    const result = actions["records.list"]!({ baseId: "appX", tableIdOrName: "Contacts", pageSize: 25 }) as Record<string, unknown>;
    expect(result.connector).toBe("airtable");
    expect(result.action).toBe("records.list");
    expect(result.source).toBe("connector");
    expect(result.validated).toEqual({ baseId: "appX", tableIdOrName: "Contacts", pageSize: 25 });
  });

  it("requires baseId and tableIdOrName", () => {
    expect(() => actions["records.list"]!({ tableIdOrName: "Contacts" })).toThrow("baseId is required");
    expect(() => actions["records.list"]!({ baseId: "appX" })).toThrow("tableIdOrName is required");
  });

  it("calls GET on the table with a bearer token and returns records plus the offset cursor", async () => {
    const { calls, fetchFn } = mockFetch(recordsListFixture);
    const result = await actions["records.list"]!({
      apiKey: "patTEST",
      baseId: "appXXXXXXXXXXXXXX",
      tableIdOrName: "Contacts",
      fetch: fetchFn,
    }) as Record<string, unknown>;

    expect(calls[0]!.url).toBe("https://api.airtable.com/v0/appXXXXXXXXXXXXXX/Contacts");
    expect(calls[0]!.init?.method).toBe("GET");
    expect((calls[0]!.init?.headers as Record<string, string>).Authorization).toBe("Bearer patTEST");
    expect(result.source).toBe("provider");
    expect(result.records).toEqual(recordsListFixture.records);
    expect(result.offset).toBe("itrABC/recOPQRSTUVWXYZ12");
  });

  it("URL-encodes a table name and sends only the filters supplied", async () => {
    const { calls, fetchFn } = mockFetch(recordsListFixture);
    await actions["records.list"]!({
      apiKey: "patTEST",
      baseId: "appX",
      tableIdOrName: "My Table",
      view: "Grid view",
      filterByFormula: "{Status}='Active'",
      fields: ["Name", "Email"],
      pageSize: 50,
      sortField: "Name",
      sortDirection: "asc",
      fetch: fetchFn,
    });

    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/v0/appX/My%20Table");
    expect(url.searchParams.get("view")).toBe("Grid view");
    expect(url.searchParams.get("filterByFormula")).toBe("{Status}='Active'");
    expect(url.searchParams.getAll("fields[]")).toEqual(["Name", "Email"]);
    expect(url.searchParams.get("pageSize")).toBe("50");
    expect(url.searchParams.get("sort[0][field]")).toBe("Name");
    expect(url.searchParams.get("sort[0][direction]")).toBe("asc");
    expect(url.searchParams.has("maxRecords")).toBe(false);
    expect(url.searchParams.has("offset")).toBe(false);
  });

  it("rejects an out-of-vocabulary sort direction before calling the provider", async () => {
    const { calls, fetchFn } = mockFetch(recordsListFixture);
    await expect(
      actions["records.list"]!({ apiKey: "patTEST", baseId: "appX", tableIdOrName: "T", sortDirection: "sideways", fetch: fetchFn }),
    ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT", message: "sortDirection must be one of: asc, desc" });
    expect(calls).toHaveLength(0);
  });
});

describe("records.get", () => {
  it("fetches one record and returns it normalized", async () => {
    const { calls, fetchFn } = mockFetch(recordFixture);
    const result = await actions["records.get"]!({
      apiKey: "patTEST",
      baseId: "appX",
      tableIdOrName: "Contacts",
      recordId: "recABCDEFGHIJKLMN",
      fetch: fetchFn,
    }) as Record<string, unknown>;

    expect(calls[0]!.url).toBe("https://api.airtable.com/v0/appX/Contacts/recABCDEFGHIJKLMN");
    expect(result.record).toEqual({
      id: "recABCDEFGHIJKLMN",
      createdTime: "2026-08-14T09:12:33.000Z",
      fields: recordFixture.fields,
    });
  });

  it("maps a 404 to CONNECTOR_UPSTREAM_ERROR carrying the Airtable message", async () => {
    const { fetchFn } = mockFetch(notFoundFixture, 404);
    await expect(
      actions["records.get"]!({ apiKey: "patTEST", baseId: "appX", tableIdOrName: "T", recordId: "recMissing", fetch: fetchFn }),
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: "Record not found" });
  });

  it("maps a 429 to CONNECTOR_RATE_LIMITED with Airtable's 30 second default backoff", async () => {
    const { fetchFn } = mockFetch({}, 429);
    await expect(
      actions["records.get"]!({ apiKey: "patTEST", baseId: "appX", tableIdOrName: "T", recordId: "rec1", fetch: fetchFn }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 30 });
  });
});

describe("records.create", () => {
  it("posts the fields map and omits typecast when it is not supplied", async () => {
    const { calls, fetchFn } = mockFetch(recordFixture, 200);
    const result = await actions["records.create"]!({
      apiKey: "patTEST",
      baseId: "appX",
      tableIdOrName: "Contacts",
      fields: { Name: "Ada Lovelace", Email: "ada@example.com" },
      fetch: fetchFn,
    }) as Record<string, unknown>;

    expect(calls[0]!.init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ fields: { Name: "Ada Lovelace", Email: "ada@example.com" } });
    expect((result.record as Record<string, unknown>).id).toBe("recABCDEFGHIJKLMN");
  });

  it("passes typecast through when supplied", async () => {
    const { calls, fetchFn } = mockFetch(recordFixture, 200);
    await actions["records.create"]!({
      apiKey: "patTEST",
      baseId: "appX",
      tableIdOrName: "Contacts",
      fields: { Status: "Active" },
      typecast: true,
      fetch: fetchFn,
    });
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ fields: { Status: "Active" }, typecast: true });
  });

  it("requires a fields object", () => {
    expect(() => actions["records.create"]!({ baseId: "appX", tableIdOrName: "T" })).toThrow("fields is required");
    expect(() => actions["records.create"]!({ baseId: "appX", tableIdOrName: "T", fields: "Name" })).toThrow("fields must be an object");
  });
});

describe("records.update", () => {
  it("PATCHes the record with the supplied fields", async () => {
    const { calls, fetchFn } = mockFetch(recordFixture);
    await actions["records.update"]!({
      apiKey: "patTEST",
      baseId: "appX",
      tableIdOrName: "Contacts",
      recordId: "recABCDEFGHIJKLMN",
      fields: { Status: "Churned" },
      fetch: fetchFn,
    });
    expect(calls[0]!.init?.method).toBe("PATCH");
    expect(calls[0]!.url).toBe("https://api.airtable.com/v0/appX/Contacts/recABCDEFGHIJKLMN");
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ fields: { Status: "Churned" } });
  });
});

describe("records.delete", () => {
  it("DELETEs the record and returns the deletion receipt", async () => {
    const { calls, fetchFn } = mockFetch({ id: "recABCDEFGHIJKLMN", deleted: true });
    const result = await actions["records.delete"]!({
      apiKey: "patTEST",
      baseId: "appX",
      tableIdOrName: "Contacts",
      recordId: "recABCDEFGHIJKLMN",
      fetch: fetchFn,
    }) as Record<string, unknown>;
    expect(calls[0]!.init?.method).toBe("DELETE");
    expect(result.id).toBe("recABCDEFGHIJKLMN");
    expect(result.deleted).toBe(true);
  });
});

describe("schema discovery", () => {
  it("bases.list reads the metadata endpoint", async () => {
    const { calls, fetchFn } = mockFetch({ bases: [{ id: "appX", name: "CRM", permissionLevel: "create" }] });
    const result = await actions["bases.list"]!({ apiKey: "patTEST", fetch: fetchFn }) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://api.airtable.com/v0/meta/bases");
    expect(result.bases).toEqual([{ id: "appX", name: "CRM", permissionLevel: "create" }]);
  });

  it("tables.list reads the base schema", async () => {
    const { calls, fetchFn } = mockFetch({ tables: [{ id: "tblX", name: "Contacts", fields: [] }] });
    const result = await actions["tables.list"]!({ apiKey: "patTEST", baseId: "appX", fetch: fetchFn }) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://api.airtable.com/v0/meta/bases/appX/tables");
    expect(result.tables).toHaveLength(1);
  });
});

describe("comments", () => {
  it("lists comments on a record", async () => {
    const { calls, fetchFn } = mockFetch({ comments: [{ id: "comX", text: "hi" }], offset: "com123" });
    const result = await actions["comments.list"]!({
      apiKey: "patTEST", baseId: "appX", tableIdOrName: "Contacts", recordId: "rec1", pageSize: 10, fetch: fetchFn,
    }) as Record<string, unknown>;
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/v0/appX/Contacts/rec1/comments");
    expect(url.searchParams.get("pageSize")).toBe("10");
    expect(result.offset).toBe("com123");
  });

  it("creates a comment", async () => {
    const { calls, fetchFn } = mockFetch({ id: "comX", text: "Following up", createdTime: "2026-09-01T00:00:00.000Z" }, 201);
    const result = await actions["comments.create"]!({
      apiKey: "patTEST", baseId: "appX", tableIdOrName: "Contacts", recordId: "rec1", text: "Following up", fetch: fetchFn,
    }) as Record<string, unknown>;
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ text: "Following up" });
    expect(result.comment).toEqual({ id: "comX", text: "Following up", createdTime: "2026-09-01T00:00:00.000Z" });
  });
});

describe("healthcheck", () => {
  it("reports connector-owned status without a credential", () => {
    expect(actions.healthcheck!({})).toEqual({
      connector: "airtable",
      action: "healthcheck",
      source: "connector",
      status: "ok",
    });
  });

  it("calls /v0/meta/whoami with the token and reports a provider-verified status", async () => {
    const { calls, fetchFn } = mockFetch({ id: "usrABC", scopes: ["data.records:read"] });
    const result = await actions.healthcheck!({ apiKey: "patTEST", fetch: fetchFn }) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://api.airtable.com/v0/meta/whoami");
    expect(result).toEqual({ connector: "airtable", action: "healthcheck", source: "provider", status: "ok", userId: "usrABC" });
  });

  it("surfaces an invalid token as an upstream error", async () => {
    const { fetchFn } = mockFetch({ error: { type: "UNAUTHORIZED", message: "Invalid authentication token" } }, 401);
    await expect(actions.healthcheck!({ apiKey: "bad", fetch: fetchFn }))
      .rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: "Invalid authentication token" });
  });
});

describe("outbound boundary", () => {
  it("only allows api.airtable.com", () => {
    expect(manifest.network.allowedHosts).toEqual(["api.airtable.com"]);
  });
});
