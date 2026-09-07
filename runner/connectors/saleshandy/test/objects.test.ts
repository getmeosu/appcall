import { describe, expect, test } from "bun:test";
import prospectsListFixture from "../fixtures/prospects_list.json";
import prospectsEmptyFixture from "../fixtures/prospects_list_empty.json";
import prospectGetFixture from "../fixtures/prospect_get.json";
import {
  normalizeProspect,
  parseProspectResponse,
  parseProspectsResponse,
} from "../src/objects";

// ---------------------------------------------------------------------------
// normalizeProspect
// Real API uses 'emailAddress', 'companyName' field names.
// The id field is numeric in real API (we stringify it).
// ---------------------------------------------------------------------------

describe("normalizeProspect", () => {
  test("normalizes a full prospect from fixture using real API field names", () => {
    const raw = (prospectsListFixture as { message: string; payload: { list: unknown[] } }).payload.list[0] as Record<string, unknown>;
    const result = normalizeProspect(raw);

    expect(result).toEqual({
      id: "sh-prospect:1001",
      provider: "saleshandy",
      email: "alice@acme.com",
      firstName: "Alice",
      lastName: "Smith",
      company: "Acme Corp",
      status: "active",
      raw,
    });
  });

  test("normalizes a prospect with minimal fields", () => {
    const result = normalizeProspect({});
    expect(result.id).toBe("sh-prospect:");
    expect(result.provider).toBe("saleshandy");
    expect(result.email).toBe("");
    expect(result.firstName).toBe("");
    expect(result.lastName).toBe("");
    expect(result.company).toBe("");
    expect(result.status).toBe("");
  });

  test("uses id field for unique id", () => {
    const result = normalizeProspect({ id: "1001", email: "test@test.com" });
    expect(result.id).toBe("sh-prospect:1001");
  });

  test("falls back to _id when id is missing", () => {
    const result = normalizeProspect({ _id: "mongo_abc", email: "test@test.com" });
    expect(result.id).toBe("sh-prospect:mongo_abc");
  });

  test("uses emailAddress field (real API name)", () => {
    const result = normalizeProspect({ id: "1002", emailAddress: "real@api.com" });
    expect(result.email).toBe("real@api.com");
  });

  test("falls back to email field (legacy name)", () => {
    const result = normalizeProspect({ id: "1003", email: "legacy@api.com" });
    expect(result.email).toBe("legacy@api.com");
  });

  test("uses companyName field (real API name)", () => {
    const result = normalizeProspect({ id: "1004", companyName: "RealCo" });
    expect(result.company).toBe("RealCo");
  });

  test("falls back to company field (legacy name)", () => {
    const result = normalizeProspect({ id: "1005", company: "LegacyCo" });
    expect(result.company).toBe("LegacyCo");
  });

  test("sets provider to saleshandy", () => {
    const result = normalizeProspect({ id: "pro_001" });
    expect(result.provider).toBe("saleshandy");
  });

  test("includes raw original object", () => {
    const raw = { id: "pro_001", emailAddress: "x@x.com" };
    const result = normalizeProspect(raw);
    expect(result.raw).toBe(raw);
  });
});

// ---------------------------------------------------------------------------
// parseProspectResponse
// Real API envelope: { message: "...", payload: { id, emailAddress, ... } }
// ---------------------------------------------------------------------------

describe("parseProspectResponse", () => {
  test("parses a prospect from real API envelope { message, payload }", () => {
    const result = parseProspectResponse(prospectGetFixture);
    expect(result.prospect).not.toBeNull();
    // Real API uses numeric id; we cast to string
    expect(result.prospect!.id).toBe("sh-prospect:1001");
    expect(result.prospect!.email).toBe("alice@acme.com");
    expect(result.prospect!.firstName).toBe("Alice");
    expect(result.prospect!.lastName).toBe("Smith");
    expect(result.prospect!.company).toBe("Acme Corp");
    expect(result.prospect!.status).toBe("active");
  });

  test("returns null for null input", () => {
    const result = parseProspectResponse(null);
    expect(result.prospect).toBeNull();
  });

  test("returns null for non-record input", () => {
    const result = parseProspectResponse("string");
    expect(result.prospect).toBeNull();
  });

  test("parses direct object (no envelope)", () => {
    const result = parseProspectResponse({ id: "pro_002", emailAddress: "bob@test.com", status: "active" });
    expect(result.prospect).not.toBeNull();
    expect(result.prospect!.id).toBe("sh-prospect:pro_002");
    expect(result.prospect!.email).toBe("bob@test.com");
  });
});

// ---------------------------------------------------------------------------
// parseProspectsResponse
// Real API envelope: { message: "...", payload: { list: [...], total: N } }
// ---------------------------------------------------------------------------

describe("parseProspectsResponse", () => {
  test("parses the prospects_list fixture (real API envelope)", () => {
    const result = parseProspectsResponse(prospectsListFixture);
    expect(result.prospects).toHaveLength(2);
    expect(result.prospects[0].id).toBe("sh-prospect:1001");
    expect(result.prospects[0].email).toBe("alice@acme.com");
    expect(result.prospects[1].id).toBe("sh-prospect:1002");
    expect(result.prospects[1].email).toBe("bob@globex.com");
    expect(result.meta).toBeDefined();
    expect((result.meta as { total: number }).total).toBe(2);
  });

  test("parses empty prospects list", () => {
    const result = parseProspectsResponse(prospectsEmptyFixture);
    expect(result.prospects).toHaveLength(0);
    expect((result.meta as { total: number }).total).toBe(0);
  });

  test("returns empty array for null input", () => {
    const result = parseProspectsResponse(null);
    expect(result.prospects).toEqual([]);
    expect(result.meta).toEqual({});
  });

  test("returns empty array for non-record input", () => {
    const result = parseProspectsResponse("string");
    expect(result.prospects).toEqual([]);
    expect(result.meta).toEqual({});
  });

  test("returns empty array when data is not an array (legacy shape)", () => {
    const result = parseProspectsResponse({ data: "bad", meta: {} });
    expect(result.prospects).toEqual([]);
  });

  test("filters non-record entries in list array (real API shape)", () => {
    const result = parseProspectsResponse({
      message: "ok",
      payload: {
        list: [null, { id: "1005", emailAddress: "x@x.com", status: "active" }, "bad", 42],
        total: 1,
      },
    });
    expect(result.prospects).toHaveLength(1);
    expect(result.prospects[0].id).toBe("sh-prospect:1005");
  });
});
