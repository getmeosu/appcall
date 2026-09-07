import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import meFixture from "../fixtures/me.json";
import createItemFixture from "../fixtures/create_item.json";
import createSubitemFixture from "../fixtures/create_subitem.json";
import changeMultipleColumnValuesFixture from "../fixtures/change_multiple_column_values.json";
import itemsFixture from "../fixtures/items.json";
import itemsPageFixture from "../fixtures/items_page.json";
import nextItemsPageFixture from "../fixtures/next_items_page.json";
import createUpdateFixture from "../fixtures/create_update.json";
import updatesFixture from "../fixtures/updates.json";
import createBoardFixture from "../fixtures/create_board.json";
import boardsFixture from "../fixtures/boards.json";
import createGroupFixture from "../fixtures/create_group.json";
import groupsFixture from "../fixtures/groups.json";
import errorUnauthorizedFixture from "../fixtures/error_unauthorized.json";
import errorComplexityFixture from "../fixtures/error_complexity.json";
import errorMessageLegacyFixture from "../fixtures/error_message_legacy.json";

const { actions } = compileDeclarativeConnector(manifest as never);

type Call = { url: string; init?: RequestInit };

function mockJson(body: unknown, status = 200, headers: Record<string, string> = {}) {
  const calls: Call[] = [];
  const fetchFn = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...headers },
    });
  };
  return { calls, fetchFn };
}

function bodyOf(call: Call): Record<string, unknown> {
  return JSON.parse(String(call.init?.body ?? "{}"));
}

describe("monday connector surface", () => {
  it("compiles one handler per declared operation", () => {
    expect(Object.keys(actions).sort()).toEqual(Object.keys(manifest.operations).sort());
  });
});

describe("authentication", () => {
  it("sends the bare token as Authorization, with no Bearer prefix", async () => {
    const { calls, fetchFn } = mockJson(meFixture);
    await actions.healthcheck!({ apiToken: "mnd_abc123", fetch: fetchFn });
    const headers = new Headers(calls[0]!.init?.headers as HeadersInit);
    expect(headers.get("Authorization")).toBe("mnd_abc123");
    expect(headers.get("Authorization")).not.toContain("Bearer");
  });

  it("pins API-Version on every call", async () => {
    const { calls, fetchFn } = mockJson(meFixture);
    await actions.healthcheck!({ apiToken: "k", fetch: fetchFn });
    const headers = new Headers(calls[0]!.init?.headers as HeadersInit);
    expect(headers.get("API-Version")).toBe("2026-07");
  });

  it("declares apiToken as the only secret setup field, matching http.auth.field", () => {
    const secretFields = manifest.auth.setup.fields.filter((field) => field.secret);
    expect(secretFields.map((field) => field.key)).toEqual(["apiToken"]);
    expect(manifest.http.auth.field).toBe("apiToken");
  });

  it("does not issue a live call when no token is supplied — the fixture-safe validated echo instead", () => {
    expect(actions.healthcheck!({})).toEqual({
      connector: "monday",
      action: "healthcheck",
      source: "connector",
      status: "ok",
    });
  });
});

describe("healthcheck", () => {
  it("posts query { me { ... } } to /v2 and reports id, name, email, isGuest", async () => {
    const { calls, fetchFn } = mockJson(meFixture);
    const result = (await actions.healthcheck!({ apiToken: "k", fetch: fetchFn })) as Record<string, unknown>;
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/v2");
    expect(calls[0]!.init?.method).toBe("POST");
    expect(bodyOf(calls[0]!).query).toContain("me");
    expect(result).toEqual({
      connector: "monday",
      action: "healthcheck",
      source: "provider",
      status: "ok",
      id: "12345678",
      name: "J Doe",
      email: "j@example.com",
      isGuest: false,
    });
  });

  it("treats a 200 carrying errors as unauthenticated, not a successful empty response", async () => {
    const { fetchFn } = mockJson(errorUnauthorizedFixture, 200);
    await expect(actions.healthcheck!({ apiToken: "bad-token", fetch: fetchFn })).rejects.toMatchObject({
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: "User unauthorized to perform action",
    });
  });

  it("treats a 200 carrying the legacy top-level error_message as a failure, not a successful empty response", async () => {
    // monday's docs describe the modern errors[] envelope, but an auth
    // failure can also come back as a legacy top-level error_message at HTTP
    // 200 with no errors array at all. Without error_message in
    // bodyErrorPaths this response passes hasBodyError and every result
    // template resolves to undefined — a "successful" empty result.
    const { fetchFn } = mockJson(errorMessageLegacyFixture, 200);
    await expect(actions.healthcheck!({ apiToken: "bad-token", fetch: fetchFn })).rejects.toMatchObject({
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: "Unauthorized: API token not found or is invalid",
    });
  });
});

describe("item.create", () => {
  it("requires boardId and itemName", () => {
    expect(() => actions["item.create"]!({ apiToken: "k", itemName: "x" })).toThrow("boardId is required");
    expect(() => actions["item.create"]!({ apiToken: "k", boardId: "b1" })).toThrow("itemName is required");
  });

  it("is classified as a GraphQL mutation, so it requires confirmation", () => {
    expect(manifest.operations["item.create"]!.sideEffect).toBe("write");
  });

  it("sends columnValues as a raw JSON string, not an object, under variables", async () => {
    const { calls, fetchFn } = mockJson(createItemFixture);
    const result = (await actions["item.create"]!({
      apiToken: "k",
      boardId: "1234567890",
      itemName: "new item",
      columnValues: '{"date":"2023-05-25","status":{"index":1}}',
      createLabels: false,
      fetch: fetchFn,
    })) as Record<string, unknown>;

    const sent = bodyOf(calls[0]!);
    expect(String(sent.query)).toContain("mutation CreateItem");
    expect(String(sent.query)).toContain("create_item(");
    const variables = sent.variables as Record<string, unknown>;
    expect(variables.boardId).toBe("1234567890");
    expect(variables.itemName).toBe("new item");
    expect(variables.columnValues).toBe('{"date":"2023-05-25","status":{"index":1}}');
    expect(typeof variables.columnValues).toBe("string");
    expect(variables.createLabels).toBe(false);

    expect(result.id).toBe("1234567890123");
    expect(result.name).toBe("new item");
    expect(result.url).toContain("pulses/1234567890123");
  });
});

describe("item.createSubitem", () => {
  it("requires parentItemId and itemName", () => {
    expect(() => actions["item.createSubitem"]!({ apiToken: "k", itemName: "x" })).toThrow("parentItemId is required");
    expect(() => actions["item.createSubitem"]!({ apiToken: "k", parentItemId: "p1" })).toThrow("itemName is required");
  });

  it("is classified as a GraphQL mutation", () => {
    expect(manifest.operations["item.createSubitem"]!.sideEffect).toBe("write");
  });

  it("posts create_subitem and returns id, name, board", async () => {
    const { calls, fetchFn } = mockJson(createSubitemFixture);
    const result = (await actions["item.createSubitem"]!({
      apiToken: "k",
      parentItemId: "1234567890123",
      itemName: "subitem name",
      fetch: fetchFn,
    })) as Record<string, unknown>;
    const sent = bodyOf(calls[0]!);
    const variables = sent.variables as Record<string, unknown>;
    expect(variables.parentItemId).toBe("1234567890123");
    expect(result.id).toBe("1234567890124");
    expect((result.board as Record<string, unknown>).id).toBe("1234567890999");
  });
});

describe("item.updateColumnValues", () => {
  it("requires boardId and columnValues", () => {
    expect(() => actions["item.updateColumnValues"]!({ apiToken: "k", columnValues: "{}" })).toThrow("boardId is required");
    expect(() => actions["item.updateColumnValues"]!({ apiToken: "k", boardId: "b1" })).toThrow("columnValues is required");
  });

  it("is classified as a GraphQL mutation", () => {
    expect(manifest.operations["item.updateColumnValues"]!.sideEffect).toBe("write");
  });

  it("declares columnValues as a string in its schema, so an object would be rejected before it reaches the wire", () => {
    expect(() =>
      actions["item.updateColumnValues"]!({
        apiToken: "k",
        boardId: "b1",
        columnValues: { name: "Updated Task Name" } as unknown as string,
      }),
    ).toThrow("columnValues must be a string");
  });

  it("sends the stringified columnValues through unchanged", async () => {
    const { calls, fetchFn } = mockJson(changeMultipleColumnValuesFixture);
    const result = (await actions["item.updateColumnValues"]!({
      apiToken: "k",
      boardId: "1234567890",
      itemId: "1234567890123",
      columnValues: '{"status":{"index":1},"date4":{"date":"2021-01-01"}}',
      fetch: fetchFn,
    })) as Record<string, unknown>;
    const sent = bodyOf(calls[0]!);
    const variables = sent.variables as Record<string, unknown>;
    expect(variables.columnValues).toBe('{"status":{"index":1},"date4":{"date":"2021-01-01"}}');
    expect(result.id).toBe("1234567890123");
    expect(result.name).toBe("Updated Task Name");
  });

  it("renames an item through the name pseudo-column, since there is no dedicated rename mutation", async () => {
    const { calls, fetchFn } = mockJson(changeMultipleColumnValuesFixture);
    await actions["item.updateColumnValues"]!({
      apiToken: "k",
      boardId: "1234567890",
      itemId: "1234567890123",
      columnValues: JSON.stringify({ name: "Updated Task Name" }),
      fetch: fetchFn,
    });
    const sent = bodyOf(calls[0]!);
    const variables = sent.variables as Record<string, unknown>;
    expect(JSON.parse(String(variables.columnValues))).toEqual({ name: "Updated Task Name" });
  });
});

describe("item.get", () => {
  it("requires ids", () => {
    expect(() => actions["item.get"]!({ apiToken: "k" })).toThrow("ids is required");
  });

  it("is classified as a GraphQL query, safe to run without confirmation", () => {
    expect(manifest.operations["item.get"]!.sideEffect).toBe("read");
  });

  it("fetches items by id array and returns the full item objects", async () => {
    const { calls, fetchFn } = mockJson(itemsFixture);
    const result = (await actions["item.get"]!({ apiToken: "k", ids: ["1234567890123"], fetch: fetchFn })) as Record<string, unknown>;
    const sent = bodyOf(calls[0]!);
    expect((sent.variables as Record<string, unknown>).ids).toEqual(["1234567890123"]);
    expect(result.items).toEqual(itemsFixture.data.items);
  });
});

describe("item.listByBoard", () => {
  it("requires boardId and limit, because the query pins $limit: Int! non-null", () => {
    expect(() => actions["item.listByBoard"]!({ apiToken: "k", limit: 25 })).toThrow("boardId is required");
    expect(() => actions["item.listByBoard"]!({ apiToken: "k", boardId: "b1" })).toThrow("limit is required");
  });

  it("is classified as a GraphQL query", () => {
    expect(manifest.operations["item.listByBoard"]!.sideEffect).toBe("read");
  });

  it("paginates with the cursor mechanism, returning items and the next cursor", async () => {
    const { calls, fetchFn } = mockJson(itemsPageFixture);
    const result = (await actions["item.listByBoard"]!({
      apiToken: "k",
      boardId: "1234567890",
      limit: 25,
      fetch: fetchFn,
    })) as Record<string, unknown>;
    const sent = bodyOf(calls[0]!);
    const variables = sent.variables as Record<string, unknown>;
    expect(variables.boardId).toBe("1234567890");
    expect(variables.limit).toBe(25);
    expect(variables.cursor).toBeUndefined();
    expect(result.items).toEqual(itemsPageFixture.data.boards[0]!.items_page.items);
    // Output key is nextCursor (matching linear's convention), even though
    // the input that continues paging is named cursor — see item.nextPage.
    expect(result.nextCursor).toBe("MSw0Nz0xMjM0");
  });
});

describe("item.nextPage", () => {
  it("requires cursor", () => {
    expect(() => actions["item.nextPage"]!({ apiToken: "k" })).toThrow("cursor is required");
  });

  it("is classified as a GraphQL query", () => {
    expect(manifest.operations["item.nextPage"]!.sideEffect).toBe("read");
  });

  it("calls next_items_page at the query root and reports a null cursor as the last page", async () => {
    const { calls, fetchFn } = mockJson(nextItemsPageFixture);
    const result = (await actions["item.nextPage"]!({ apiToken: "k", cursor: "MSw0Nz0xMjM0", fetch: fetchFn })) as Record<string, unknown>;
    const sent = bodyOf(calls[0]!);
    expect(String(sent.query)).toContain("next_items_page(cursor: $cursor)");
    expect((sent.variables as Record<string, unknown>).cursor).toBe("MSw0Nz0xMjM0");
    expect(result.items).toEqual(nextItemsPageFixture.data.next_items_page.items);
    // A null cursor in the body is unresolved, so the mapped nextCursor result
    // simply omits it rather than emitting a literal null — a caller loops on
    // its absence.
    expect(result.nextCursor).toBeUndefined();
  });
});

describe("update.create", () => {
  it("requires body", () => {
    expect(() => actions["update.create"]!({ apiToken: "k", itemId: "i1" })).toThrow("body is required");
  });

  it("is classified as a GraphQL mutation", () => {
    expect(manifest.operations["update.create"]!.sideEffect).toBe("write");
  });

  it("posts create_update and returns id, body, createdAt", async () => {
    const { calls, fetchFn } = mockJson(createUpdateFixture);
    const result = (await actions["update.create"]!({
      apiToken: "k",
      itemId: "1234567890123",
      body: "This is an update",
      fetch: fetchFn,
    })) as Record<string, unknown>;
    const sent = bodyOf(calls[0]!);
    const variables = sent.variables as Record<string, unknown>;
    expect(variables.itemId).toBe("1234567890123");
    expect(variables.body).toBe("This is an update");
    expect(result.id).toBe("987654321");
    expect(result.createdAt).toBe("2023-05-25T12:00:00Z");
  });
});

describe("update.list", () => {
  it("does not require input and is a read", () => {
    expect(manifest.operations["update.list"]!.sideEffect).toBe("read");
  });

  it("paginates with limit/page, not a cursor", async () => {
    const { calls, fetchFn } = mockJson(updatesFixture);
    const result = (await actions["update.list"]!({ apiToken: "k", limit: 50, page: 1, fetch: fetchFn })) as Record<string, unknown>;
    const sent = bodyOf(calls[0]!);
    const variables = sent.variables as Record<string, unknown>;
    expect(variables.limit).toBe(50);
    expect(variables.page).toBe(1);
    expect(variables.cursor).toBeUndefined();
    expect(result.updates).toEqual(updatesFixture.data.updates);
  });
});

describe("board.create", () => {
  it("requires boardName and boardKind", () => {
    expect(() => actions["board.create"]!({ apiToken: "k", boardKind: "public" })).toThrow("boardName is required");
    expect(() => actions["board.create"]!({ apiToken: "k", boardName: "x" })).toThrow("boardKind is required");
  });

  it("is classified as a GraphQL mutation", () => {
    expect(manifest.operations["board.create"]!.sideEffect).toBe("write");
  });

  it("posts create_board and returns only id and name, not an unverified url", async () => {
    const { calls, fetchFn } = mockJson(createBoardFixture);
    const result = (await actions["board.create"]!({
      apiToken: "k",
      boardName: "New Board",
      boardKind: "public",
      fetch: fetchFn,
    })) as Record<string, unknown>;
    const sent = bodyOf(calls[0]!);
    const variables = sent.variables as Record<string, unknown>;
    expect(variables.boardName).toBe("New Board");
    expect(variables.boardKind).toBe("public");
    expect(result.id).toBe("1234567890");
    expect(result.name).toBe("New Board");
    expect(result.url).toBeUndefined();
  });
});

describe("board.list", () => {
  it("does not require input and is a read", () => {
    expect(manifest.operations["board.list"]!.sideEffect).toBe("read");
  });

  it("paginates with limit/page, not a cursor", async () => {
    const { calls, fetchFn } = mockJson(boardsFixture);
    const result = (await actions["board.list"]!({ apiToken: "k", limit: 25, page: 1, fetch: fetchFn })) as Record<string, unknown>;
    const sent = bodyOf(calls[0]!);
    const variables = sent.variables as Record<string, unknown>;
    expect(variables.limit).toBe(25);
    expect(variables.page).toBe(1);
    expect(result.boards).toEqual(boardsFixture.data.boards);
  });
});

describe("group.create", () => {
  it("requires boardId and groupName", () => {
    expect(() => actions["group.create"]!({ apiToken: "k", groupName: "x" })).toThrow("boardId is required");
    expect(() => actions["group.create"]!({ apiToken: "k", boardId: "b1" })).toThrow("groupName is required");
  });

  it("is classified as a GraphQL mutation", () => {
    expect(manifest.operations["group.create"]!.sideEffect).toBe("write");
  });

  it("posts create_group and returns the new group id", async () => {
    const { calls, fetchFn } = mockJson(createGroupFixture);
    const result = (await actions["group.create"]!({
      apiToken: "k",
      boardId: "1234567890",
      groupName: "New Group",
      groupColor: "#ff642e",
      fetch: fetchFn,
    })) as Record<string, unknown>;
    const sent = bodyOf(calls[0]!);
    const variables = sent.variables as Record<string, unknown>;
    expect(variables.boardId).toBe("1234567890");
    expect(variables.groupName).toBe("New Group");
    expect(variables.groupColor).toBe("#ff642e");
    expect(result.id).toBe("group_one");
  });
});

describe("group.list", () => {
  it("requires boardId", () => {
    expect(() => actions["group.list"]!({ apiToken: "k" })).toThrow("boardId is required");
  });

  it("is classified as a GraphQL query", () => {
    expect(manifest.operations["group.list"]!.sideEffect).toBe("read");
  });

  it("lists a board's groups", async () => {
    const { calls, fetchFn } = mockJson(groupsFixture);
    const result = (await actions["group.list"]!({ apiToken: "k", boardId: "1234567890", fetch: fetchFn })) as Record<string, unknown>;
    const sent = bodyOf(calls[0]!);
    expect((sent.variables as Record<string, unknown>).boardId).toBe("1234567890");
    expect(result.groups).toEqual(groupsFixture.data.boards[0]!.groups);
  });
});

// --- The two mandatory GraphQL-specific error cases from the task brief ---

describe("error mapping", () => {
  it("rejects a 200 carrying a populated errors array as CONNECTOR_UPSTREAM_ERROR, carrying monday's own message", async () => {
    const { fetchFn } = mockJson(errorUnauthorizedFixture, 200);
    await expect(
      actions["item.create"]!({ apiToken: "k", boardId: "1234567890", itemName: "x", fetch: fetchFn }),
    ).rejects.toMatchObject({
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: "User unauthorized to perform action",
    });
  });

  it("rejects a complexity-budget exhaustion as CONNECTOR_RATE_LIMITED, with retryAfterSeconds read from the body", async () => {
    const { fetchFn } = mockJson(errorComplexityFixture, 429);
    await expect(
      actions["item.listByBoard"]!({ apiToken: "k", boardId: "1234567890", limit: 500, fetch: fetchFn }),
    ).rejects.toMatchObject({
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      retryAfterSeconds: 30,
    });
  });

  it("also classifies a complexity error carried in a 200 body as rate limiting, since the code path is checked independently of status", async () => {
    const { fetchFn } = mockJson(errorComplexityFixture, 200);
    await expect(
      actions["item.listByBoard"]!({ apiToken: "k", boardId: "1234567890", limit: 500, fetch: fetchFn }),
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 30 });
  });

  it("does not classify an ordinary error without a rate-limit code as a rate limit", async () => {
    const { fetchFn } = mockJson(errorUnauthorizedFixture, 403);
    await expect(actions.healthcheck!({ apiToken: "k", fetch: fetchFn })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });

  it("refuses a host outside the manifest's allow list", async () => {
    const offHost = { ...manifest, network: { allowedHosts: ["example.invalid"] } };
    const compiled = compileDeclarativeConnector(offHost as never);
    await expect(
      compiled.actions.healthcheck!({ apiToken: "k", fetch: async () => new Response(JSON.stringify(meFixture)) }),
    ).rejects.toMatchObject({ code: "OUTBOUND_HOST_NOT_ALLOWED" });
  });
});
