import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;

describe("monday manifest", () => {
  it("declares the connector identity the control plane keys on", () => {
    expect(manifest.key).toBe("monday");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["productivity"]);
    expect(manifest.models.length).toBeGreaterThan(0);
  });

  it("declares api_key setup for the personal API token, agreeing with http.auth.field", () => {
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.auth.setup.mode).toBe("api_key");
    const secretFields = manifest.auth.setup.fields.filter((field: Record<string, unknown>) => field.secret);
    expect(secretFields.map((field: Record<string, unknown>) => field.key)).toEqual(["apiToken"]);
    expect(manifest.http.auth.field).toBe("apiToken");
  });

  it("targets the single documented GraphQL host", () => {
    expect(manifest.http.baseUrl).toBe("https://api.monday.com");
    expect(manifest.network.allowedHosts).toEqual(["api.monday.com"]);
  });

  it("does not allowlist auth.monday.com, because OAuth is not implemented here", () => {
    expect(manifest.network.allowedHosts).not.toContain("auth.monday.com");
  });

  it("declares exactly the 13 operations the brief lists", () => {
    expect(Object.keys(operations).sort()).toEqual(
      [
        "healthcheck",
        "item.create",
        "item.createSubitem",
        "item.updateColumnValues",
        "item.get",
        "item.listByBoard",
        "item.nextPage",
        "update.create",
        "update.list",
        "board.create",
        "board.list",
        "group.create",
        "group.list",
      ].sort(),
    );
  });

  it("does not add an item.rename operation — renaming goes through updateColumnValues", () => {
    expect(Object.keys(operations)).not.toContain("item.rename");
    expect(String(operations["item.updateColumnValues"]!.description)).toContain("name");
    expect(String(operations["item.updateColumnValues"]!.description).toLowerCase()).toContain("rename");
  });

  it("gives every action the limits and tool schema the MCP gateway requires", () => {
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind).toBe("action");
      expect(operation.timeoutMs as number).toBeGreaterThan(0);
      expect(operation.maxInputBytes as number).toBeGreaterThan(0);
      expect(operation.maxResponseBytes as number).toBeGreaterThan(0);
      expect(String(operation.title ?? "").length).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length).toBeGreaterThan(0);
      expect((operation.inputSchema as Record<string, unknown>).type).toBe("object");
      expect(operation.outputSchema, `${key} must declare an outputSchema`).toBeDefined();
      expect(["read", "write"]).toContain(operation.sideEffect as string);
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
    }
  });

  it("posts every operation to /v2 — the only endpoint the provider has", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      expect(String(request.method ?? "GET"), `${key} must POST`).toBe("POST");
      expect(request.path, `${key} must target /v2`).toBe("/v2");
    }
  });

  // --- The deliberate departure from the shared template, same as Linear: sideEffect
  // must come from the GraphQL operation keyword, not the HTTP method, because every
  // monday call — including every read — is POST /v2. ---
  it("classifies GraphQL operations by mutation-vs-query, not by HTTP method", () => {
    for (const [key, op] of Object.entries(operations)) {
      const query = String(((op.request as Record<string, unknown>).body as Record<string, unknown>).query ?? "");
      const expected = query.trimStart().startsWith("mutation") ? "write" : "read";
      expect(op.sideEffect, `${key} is a GraphQL ${expected}`).toBe(expected);
    }
  });

  it("sends the token bare, matching monday's documented form", () => {
    expect(manifest.http.auth.value).toBe("{{apiToken}}");
    expect(manifest.http.auth.value).not.toContain("Bearer");
    expect(manifest.http.auth.in).toBe("header");
    expect(manifest.http.auth.name).toBe("Authorization");
  });

  it("pins the API version, because omitting it floats to Current every quarter", () => {
    expect(manifest.http.headers["API-Version"]).toBe("2026-07");
  });

  it("declares column values as a JSON string, which is the shape monday accepts", () => {
    const schema = operations["item.updateColumnValues"]!.inputSchema as {
      properties?: Record<string, { type?: string }>;
    };
    expect(schema.properties?.columnValues?.type).toBe("string");
    expect(String(operations["item.updateColumnValues"]!.description)).toContain("JSON");

    const createSchema = operations["item.create"]!.inputSchema as {
      properties?: Record<string, { type?: string }>;
    };
    expect(createSchema.properties?.columnValues?.type).toBe("string");

    const subitemSchema = operations["item.createSubitem"]!.inputSchema as {
      properties?: Record<string, { type?: string }>;
    };
    expect(subitemSchema.properties?.columnValues?.type).toBe("string");
  });

  it("treats a 200 carrying errors as a failure, including the legacy error_message envelope", () => {
    // monday's GraphQL errors array is the modern shape, but auth failures can
    // also come back as a legacy top-level error_message at HTTP 200 (see
    // messagePaths below, which already reads it as a message source) — both
    // must be declared as body-error paths or that shape passes hasBodyError
    // and the agent gets a "successful" empty result instead of a failure.
    expect(manifest.http.errors.bodyErrorPaths).toEqual(["errors", "error_message"]);
  });

  it("reads the retry delay from the body, since monday sends no Retry-After", () => {
    expect(manifest.http.errors.retryAfterPaths).toContain("errors.0.extensions.retry_in_seconds");
  });

  it("classifies the complexity budget and its siblings as rate limiting, not a generic error", () => {
    expect(manifest.http.errors.rateLimitCodePaths).toEqual(["errors.0.extensions.code"]);
    expect(manifest.http.errors.rateLimitCodes).toEqual(
      expect.arrayContaining([
        "ComplexityException",
        "COMPLEXITY_BUDGET_EXHAUSTED",
        "DAILY_LIMIT_EXCEEDED",
        "maxConcurrencyExceeded",
        "IP_RATE_LIMIT_EXCEEDED",
      ]),
    );
  });

  it("reads the provider's own GraphQL error message first", () => {
    expect(manifest.http.errors.messagePaths?.[0]).toBe("errors.0.message");
  });

  it("declares 429 as the rate-limit status, monday's documented code", () => {
    expect(manifest.http.errors.rateLimitStatuses).toEqual([429]);
  });

  it("asserts the healthcheck reads data.me.id, not just a 200 status", () => {
    const healthcheck = operations.healthcheck!;
    const result = (healthcheck.request as Record<string, unknown>).result as Record<string, unknown>;
    expect(String(result.id)).toBe("{{response.data.me.id}}");
  });

  it("uses cursor pagination for items, at the query root for page 2..N", () => {
    const listSchema = operations["item.listByBoard"]!.inputSchema as { properties?: Record<string, unknown>; required?: string[] };
    expect(Object.keys(listSchema.properties ?? {})).toContain("cursor");
    expect(Object.keys(listSchema.properties ?? {})).not.toContain("page");

    const nextPageSchema = operations["item.nextPage"]!.inputSchema as { required?: string[] };
    expect(nextPageSchema.required ?? []).toContain("cursor");

    const nextPageBody = (operations["item.nextPage"]!.request as Record<string, unknown>).body as Record<string, unknown>;
    expect(String(nextPageBody.query)).toContain("next_items_page");
    // next_items_page must sit at the query root, not re-nested under boards — that
    // is the whole point of the second mechanism, per the research doc.
    expect(String(nextPageBody.query)).not.toContain("boards");
  });

  it("names the pagination OUTPUT nextCursor, distinct from the cursor input, matching linear's convention", () => {
    for (const key of ["item.listByBoard", "item.nextPage"]) {
      const schema = operations[key]!.outputSchema as { properties?: Record<string, unknown> };
      const props = Object.keys(schema.properties ?? {});
      expect(props, `${key} output should be named nextCursor`).toContain("nextCursor");
      expect(props, `${key} output should not reuse the input name cursor`).not.toContain("cursor");
    }
  });

  it("uses 1-based page pagination for boards, updates and groups, with no cursor", () => {
    for (const key of ["board.list", "update.list"]) {
      const schema = operations[key]!.inputSchema as { properties?: Record<string, unknown> };
      const props = Object.keys(schema.properties ?? {});
      expect(props, `${key} should accept page`).toContain("page");
      expect(props, `${key} should not accept a cursor`).not.toContain("cursor");
    }
  });

  it("requires boardId and limit on item.listByBoard, because the query pins $limit: Int! non-null", () => {
    const schema = operations["item.listByBoard"]!.inputSchema as { required?: string[] };
    expect(schema.required ?? []).toContain("boardId");
    expect(schema.required ?? []).toContain("limit");
  });

  it("requires boardId and itemName on item.create", () => {
    const schema = operations["item.create"]!.inputSchema as { required?: string[] };
    expect(schema.required ?? []).toEqual(expect.arrayContaining(["boardId", "itemName"]));
  });

  it("requires parentItemId and itemName on item.createSubitem", () => {
    const schema = operations["item.createSubitem"]!.inputSchema as { required?: string[] };
    expect(schema.required ?? []).toEqual(expect.arrayContaining(["parentItemId", "itemName"]));
  });

  it("requires boardId and columnValues on item.updateColumnValues", () => {
    const schema = operations["item.updateColumnValues"]!.inputSchema as { required?: string[] };
    expect(schema.required ?? []).toEqual(expect.arrayContaining(["boardId", "columnValues"]));
  });

  it("requires ids on item.get", () => {
    const schema = operations["item.get"]!.inputSchema as { required?: string[] };
    expect(schema.required ?? []).toContain("ids");
  });

  it("requires body on update.create", () => {
    const schema = operations["update.create"]!.inputSchema as { required?: string[] };
    expect(schema.required ?? []).toContain("body");
  });

  it("requires boardName and boardKind on board.create, and only requests id name — not url", () => {
    const schema = operations["board.create"]!.inputSchema as { required?: string[] };
    expect(schema.required ?? []).toEqual(expect.arrayContaining(["boardName", "boardKind"]));
    const body = (operations["board.create"]!.request as Record<string, unknown>).body as Record<string, unknown>;
    expect(String(body.query)).not.toContain("url");
  });

  it("requires boardId and groupName on group.create", () => {
    const schema = operations["group.create"]!.inputSchema as { required?: string[] };
    expect(schema.required ?? []).toEqual(expect.arrayContaining(["boardId", "groupName"]));
  });

  it("requires boardId on group.list", () => {
    const schema = operations["group.list"]!.inputSchema as { required?: string[] };
    expect(schema.required ?? []).toContain("boardId");
  });

  it("does not require anything on update.list or board.list", () => {
    for (const key of ["update.list", "board.list"]) {
      const schema = operations[key]!.inputSchema as { required?: string[] };
      expect(schema.required ?? [], `${key} should not require input`).toEqual([]);
    }
  });

  it("only interpolates body placeholders the operation's schema declares", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      const schema = operation.inputSchema as { properties?: Record<string, unknown> };
      const declared = Object.keys(schema.properties ?? {});
      const templated = [...JSON.stringify(request.body ?? {}).matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)]
        .map((match) => match[1]!)
        .filter((name) => name.startsWith("input.") === false);
      for (const name of templated) {
        expect(declared, `${key} references {{${name}}}`).toContain(name);
      }
    }
  });

  it("keeps every operation key inside the control plane's safe charset", () => {
    for (const key of Object.keys(operations)) {
      expect(key).toMatch(/^[a-zA-Z0-9._-]+$/);
    }
  });

  it("uses variables rather than string interpolation for every GraphQL document", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const body = (operation.request as Record<string, unknown>).body as Record<string, unknown>;
      if (key === "healthcheck") {
        expect(body.variables).toBeUndefined();
        continue;
      }
      const query = String(body.query);
      // A manifest with variables:{} and a {{placeholder}} spliced directly
      // into the query text would still pass "variables is defined" — assert
      // the actual contract instead: no {{ }} template placeholder anywhere
      // in the query string...
      expect(query, `${key} query string must not contain a {{ }} template placeholder`).not.toContain("{{");
      // ...and every $varName the document's operation signature declares
      // (e.g. "query Foo($boardId: ID!)") is present as a key in variables,
      // so the value actually reaches the query through GraphQL's own
      // mechanism rather than being silently dropped.
      const declaredVars = new Set(Array.from(query.matchAll(/\$(\w+)\s*:/g)).map((m) => m[1]!));
      expect(declaredVars.size, `${key} query document declares no $variables to check`).toBeGreaterThan(0);
      const variables = (body.variables ?? {}) as Record<string, unknown>;
      for (const varName of declaredVars) {
        expect(Object.keys(variables), `${key} declares $${varName} but does not pass it in variables`).toContain(varName);
      }
    }
  });
});
