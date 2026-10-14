import { describe, expect, test } from "bun:test";
import { loadFixtureCases, runCandidateFixtures } from "../../../../scripts/connector-gen/openconnector/recipe-fixtures";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

// The 13 Composio AIRTABLE_* tools implemented by the L2 depth pass as
// declarative operations. Every entry must keep a concrete request in the
// manifest and replay a documented success fixture.
const l2Operations = [
  "bases.create",
  "bases.get_metadata",
  "comments.delete",
  "comments.update",
  "fields.create",
  "fields.update",
  "records.delete_multiple",
  "records.update_multiple",
  "records.update_multiple_put",
  "records.update_put",
  "records.upload_attachment",
  "tables.create",
  "tables.update",
];

const { actions } = compileDeclarativeConnector(manifest as never);

function mockFetch(body: unknown, status = 200, headers: Record<string, string> = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchFn = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(url), init });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...headers },
    });
  };
  return { calls, fetchFn };
}

describe("airtable L2 depth contract", () => {
  test("every L2 tool maps to a declarative operation with a method and path", () => {
    const operations = manifest.operations as Record<string, { request?: { method?: string; path?: string } }>;
    for (const key of l2Operations) {
      expect(operations[key]?.request?.method, key).toBeTruthy();
      expect(operations[key]?.request?.path, key).toBeTruthy();
      expect(typeof actions[key], key).toBe("function");
    }
  });

  test("replays the documented L2 fixture cases", async () => {
    const cases = loadFixtureCases(new URL("../fixtures/cases", import.meta.url).pathname);
    const runs = await runCandidateFixtures(JSON.stringify(manifest), cases);
    expect(runs.length).toBe(l2Operations.length);
    for (const run of runs) {
      if (run.status !== "passed") throw new Error(`${run.caseId}: ${run.error}`);
    }
  });

  test("covers every L2 operation with a positive fixture", () => {
    const cases = loadFixtureCases(new URL("../fixtures/cases", import.meta.url).pathname);
    const positive = new Set(cases.filter((c) => c.expected.kind === "success").map((c) => c.operation));
    expect([...positive].sort()).toEqual([...l2Operations].sort());
  });
});

describe("airtable L2 behavior", () => {
  test("batch delete sends one records[] query parameter per record ID", async () => {
    const { calls, fetchFn } = mockFetch({ records: [] });
    await actions["records.delete_multiple"]!({
      apiKey: "patTEST",
      baseId: "appX",
      tableIdOrName: "Contacts",
      records: ["rec1", "rec2"],
      fetch: fetchFn,
    });
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/v0/appX/Contacts");
    expect(url.searchParams.getAll("records[]")).toEqual(["rec1", "rec2"]);
    expect(calls[0]!.init?.method).toBe("DELETE");
  });

  test("declares the PUT replace routes destructive and the PATCH update a plain write", () => {
    const operations = manifest.operations as Record<string, { sideEffect?: string }>;
    expect(operations["records.update_multiple_put"]?.sideEffect).toBe("destructive");
    expect(operations["records.update_put"]?.sideEffect).toBe("destructive");
    expect(operations["records.update_multiple"]?.sideEffect).toBe("write");
  });

  test("uploads attachments to the content host with a bearer token", async () => {
    const { calls, fetchFn } = mockFetch({ id: "rec1", createdTime: "2026-09-01T00:00:00.000Z", fields: {} });
    await actions["records.upload_attachment"]!({
      apiKey: "patTEST",
      baseId: "appX",
      recordId: "rec1",
      attachmentFieldIdOrName: "Attachments",
      contentType: "text/plain",
      file: "SGVsbG8gd29ybGQ=",
      filename: "sample.txt",
      fetch: fetchFn,
    });
    expect(calls[0]!.url).toBe("https://content.airtable.com/v0/appX/rec1/Attachments/uploadAttachment");
    expect((calls[0]!.init?.headers as Record<string, string>).Authorization).toBe("Bearer patTEST");
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ contentType: "text/plain", file: "SGVsbG8gd29ybGQ=", filename: "sample.txt" });
  });

  test("rejects missing required input before any network call", () => {
    expect(() => actions["records.delete_multiple"]!({ baseId: "appX", tableIdOrName: "Contacts" })).toThrow("records is required");
    expect(() => actions["bases.create"]!({ name: "New base" })).toThrow("workspaceId is required");
    expect(() => actions["records.upload_attachment"]!({ baseId: "appX", recordId: "rec1" })).toThrow("attachmentFieldIdOrName is required");
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED with Airtable's 30 second default backoff", async () => {
    const { fetchFn } = mockFetch({}, 429);
    await expect(
      actions["bases.get_metadata"]!({ apiKey: "patTEST", baseId: "appX", fetch: fetchFn }),
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 30 });
  });

  test("keeps every outbound host inside the declared allowlist", () => {
    expect(manifest.network.allowedHosts).toEqual(["api.airtable.com", "content.airtable.com"]);
  });
});
