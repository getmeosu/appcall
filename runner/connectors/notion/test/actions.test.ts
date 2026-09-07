import { describe, expect, test } from "bun:test";
import blockFixture from "../fixtures/block_children.json";
import commentsFixture from "../fixtures/comments.json";
import databaseFixture from "../fixtures/database.json";
import databaseQueryFixture from "../fixtures/database_query.json";
import searchFixture from "../fixtures/search_pages.json";
import { appendDocumentText, createComment, createDatabaseItem, createDocument, getDatabase, getDatabaseItem, getDocument, listComments, listDatabaseItems, listDocumentBlocks, restoreDatabaseItem, restoreDocument, searchDocuments, trashDatabaseItem, trashDocument, updateDatabaseItem, validateCredentials, validateCredentialsLive } from "../src/actions";

describe("notion connector actions", () => {
  test("validateCredentials accepts required setup fields", () => {
    const result = validateCredentials({ notionToken: "secret_notion_token" });

    expect(result).toEqual({
      connector: "notion",
      action: "credentials.validate",
      source: "connector",
      valid: true,
    });
    expect(JSON.stringify(result)).not.toContain("secret_notion_token");
  });

  test("validateCredentials uses live validation when an HTTP boundary is supplied", async () => {
    const requests: Request[] = [];

    const result = await validateCredentials({
      notionToken: "secret_notion_token",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json({ object: "user", id: "user_456", type: "bot" });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.notion.com/v1/users/me");
    expect(result).toEqual({
      connector: "notion",
      action: "credentials.validate",
      source: "connector",
      valid: true,
      workspaceUserId: "user_456",
    });
    expect(JSON.stringify(result)).not.toContain("secret_notion_token");
  });

  test("validateCredentials rejects missing setup fields", () => {
    expect(() => validateCredentials({})).toThrow();
    expect(() => validateCredentials({ notionToken: "" })).toThrow();
  });

  test("validateCredentialsLive calls Notion users/me through raw HTTP boundary", async () => {
    const requests: Request[] = [];

    const result = await validateCredentialsLive({
      notionToken: "secret_notion_token",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json({ object: "user", id: "user_123", type: "person" });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.notion.com/v1/users/me");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer secret_notion_token");
    expect(requests[0].headers.get("Notion-Version")).toBe("2026-03-11");
    expect(result).toEqual({
      connector: "notion",
      action: "credentials.validate",
      source: "connector",
      valid: true,
      workspaceUserId: "user_123",
    });
    expect(JSON.stringify(result)).not.toContain("secret_notion_token");
  });

  test("validateCredentialsLive maps Notion auth failures without leaking token", async () => {
    const result = await validateCredentialsLive({
      notionToken: "secret_notion_token",
      fetch: async () => Response.json({
        object: "error",
        status: 401,
        code: "unauthorized",
        message: "API token is invalid.",
      }, { status: 401 }),
    });

    expect(result).toEqual({
      connector: "notion",
      action: "credentials.validate",
      source: "connector",
      valid: false,
      error: {
        code: "AUTHENTICATION_FAILED",
        message: "Notion rejected the provided credentials.",
        providerError: "unauthorized",
      },
    });
    expect(JSON.stringify(result)).not.toContain("secret_notion_token");
  });

  test("validateCredentialsLive maps Notion rate limits", async () => {
    const result = await validateCredentialsLive({
      notionToken: "secret_notion_token",
      fetch: async () => Response.json({
        object: "error",
        status: 429,
        code: "rate_limited",
        message: "Slow down.",
      }, {
        status: 429,
        headers: { "Retry-After": "12" },
      }),
    });

    expect(result).toEqual({
      connector: "notion",
      action: "credentials.validate",
      source: "connector",
      valid: false,
      error: {
        code: "CONNECTOR_RATE_LIMITED",
        message: "The upstream provider rate limited this request.",
        providerError: "rate_limited",
        retryAfterSeconds: 12,
      },
    });
  });

  test("searchDocuments validates search input without live credentials", () => {
    const result = searchDocuments({ query: "meeting notes", pageSize: 25 });

    expect(result).toEqual({
      connector: "notion",
      action: "documents.search",
      source: "connector",
      validated: {
        query: "meeting notes",
        pageSize: 25,
      },
    });
  });

  test("searchDocuments posts to Notion search with page filter when a token is supplied", async () => {
    const requests: Request[] = [];

    const result = await searchDocuments({
      notionToken: "secret_notion_token",
      query: "Appcall",
      cursor: "cursor-1",
      pageSize: 10,
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json(searchFixture);
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.notion.com/v1/search");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer secret_notion_token");
    expect(requests[0].headers.get("Notion-Version")).toBe("2026-03-11");
    expect(requests[0].headers.get("Content-Type")).toBe("application/json");
    expect(await requests[0].json()).toEqual({
      query: "Appcall",
      start_cursor: "cursor-1",
      page_size: 10,
      filter: {
        property: "object",
        value: "page",
      },
      sort: {
        direction: "descending",
        timestamp: "last_edited_time",
      },
    });
    expect(result).toMatchObject({
      connector: "notion",
      action: "documents.search",
      source: "connector",
      ok: true,
      cursor: "next-page-cursor",
    });
    expect(result.ok && result.items[0].id).toBe("notion:33333333-3333-3333-3333-333333333333");
    expect(JSON.stringify(result)).not.toContain("secret_notion_token");
  });

  test("searchDocuments maps Notion auth failures without leaking token", async () => {
    const result = await searchDocuments({
      notionToken: "secret_notion_token",
      fetch: async () => Response.json({
        object: "error",
        status: 403,
        code: "restricted_resource",
      }, { status: 403 }),
    });

    expect(result).toEqual({
      connector: "notion",
      action: "documents.search",
      source: "connector",
      ok: false,
      error: {
        code: "CONNECTOR_CAPABILITY_MISSING",
        message: "Notion credentials do not have access to search pages.",
        providerError: "restricted_resource",
      },
    });
    expect(JSON.stringify(result)).not.toContain("secret_notion_token");
  });

  test("getDocument validates page id without live credentials", () => {
    const result = getDocument({ pageId: "33333333-3333-3333-3333-333333333333" });

    expect(result).toEqual({
      connector: "notion",
      action: "documents.get",
      source: "connector",
      validated: {
        pageId: "33333333-3333-3333-3333-333333333333",
      },
    });
  });

  test("getDocument retrieves a Notion page when a token is supplied", async () => {
    const requests: Request[] = [];

    const result = await getDocument({
      notionToken: "secret_notion_token",
      pageId: "33333333-3333-3333-3333-333333333333",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json(searchFixture.results[0]);
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.notion.com/v1/pages/33333333-3333-3333-3333-333333333333");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer secret_notion_token");
    expect(requests[0].headers.get("Notion-Version")).toBe("2026-03-11");
    expect(result).toMatchObject({
      connector: "notion",
      action: "documents.get",
      source: "connector",
      ok: true,
      document: {
        id: "notion:33333333-3333-3333-3333-333333333333",
        title: "Appcall Plan",
      },
    });
    expect(JSON.stringify(result)).not.toContain("secret_notion_token");
  });

  test("getDocument maps missing pages without leaking token", async () => {
    const result = await getDocument({
      notionToken: "secret_notion_token",
      pageId: "33333333-3333-3333-3333-333333333333",
      fetch: async () => Response.json({
        object: "error",
        status: 404,
        code: "object_not_found",
      }, { status: 404 }),
    });

    expect(result).toEqual({
      connector: "notion",
      action: "documents.get",
      source: "connector",
      ok: false,
      error: {
        code: "CONNECTOR_NOT_FOUND",
        message: "Notion page was not found or is not shared with the integration.",
        providerError: "object_not_found",
      },
    });
    expect(JSON.stringify(result)).not.toContain("secret_notion_token");
  });

  test("createDocument validates child page input without live credentials", () => {
    const result = createDocument({
      parentPageId: "33333333-3333-3333-3333-333333333333",
      title: "Launch Notes",
      content: "First customer notes.",
    });

    expect(result).toEqual({
      connector: "notion",
      action: "documents.create",
      source: "connector",
      validated: {
        parentPageId: "33333333-3333-3333-3333-333333333333",
        title: "Launch Notes",
        content: "First customer notes.",
      },
    });
  });

  test("createDocument posts a Notion child page when a token is supplied", async () => {
    const requests: Request[] = [];

    const result = await createDocument({
      notionToken: "secret_notion_token",
      parentPageId: "33333333-3333-3333-3333-333333333333",
      title: "Launch Notes",
      content: "First customer notes.",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json(searchFixture.results[0]);
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.notion.com/v1/pages");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer secret_notion_token");
    expect(requests[0].headers.get("Notion-Version")).toBe("2026-03-11");
    expect(requests[0].headers.get("Content-Type")).toBe("application/json");
    expect(await requests[0].json()).toEqual({
      parent: {
        page_id: "33333333-3333-3333-3333-333333333333",
      },
      properties: {
        title: {
          title: [{
            text: {
              content: "Launch Notes",
            },
          }],
        },
      },
      children: [{
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [{
            type: "text",
            text: {
              content: "First customer notes.",
            },
          }],
        },
      }],
    });
    expect(result).toMatchObject({
      connector: "notion",
      action: "documents.create",
      source: "connector",
      ok: true,
      document: {
        id: "notion:33333333-3333-3333-3333-333333333333",
      },
    });
    expect(JSON.stringify(result)).not.toContain("secret_notion_token");
  });

  test("createDocument maps missing insert-content capability without leaking token", async () => {
    const result = await createDocument({
      notionToken: "secret_notion_token",
      parentPageId: "33333333-3333-3333-3333-333333333333",
      title: "Launch Notes",
      fetch: async () => Response.json({
        object: "error",
        status: 403,
        code: "restricted_resource",
      }, { status: 403 }),
    });

    expect(result).toEqual({
      connector: "notion",
      action: "documents.create",
      source: "connector",
      ok: false,
      error: {
        code: "CONNECTOR_CAPABILITY_MISSING",
        message: "Notion credentials do not have access to create pages.",
        providerError: "restricted_resource",
      },
    });
    expect(JSON.stringify(result)).not.toContain("secret_notion_token");
  });

  test("trashDocument validates page id without live credentials", () => {
    const result = trashDocument({ pageId: "33333333-3333-3333-3333-333333333333" });

    expect(result).toEqual({
      connector: "notion",
      action: "documents.trash",
      source: "connector",
      validated: {
        pageId: "33333333-3333-3333-3333-333333333333",
      },
    });
  });

  test("trashDocument patches Notion in_trash true when a token is supplied", async () => {
    const requests: Request[] = [];

    const result = await trashDocument({
      notionToken: "secret_notion_token",
      pageId: "33333333-3333-3333-3333-333333333333",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json({
          ...searchFixture.results[0],
          in_trash: true,
        });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.notion.com/v1/pages/33333333-3333-3333-3333-333333333333");
    expect(requests[0].method).toBe("PATCH");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer secret_notion_token");
    expect(requests[0].headers.get("Notion-Version")).toBe("2026-03-11");
    expect(await requests[0].json()).toEqual({ in_trash: true });
    expect(result).toMatchObject({
      connector: "notion",
      action: "documents.trash",
      source: "connector",
      ok: true,
      document: {
        id: "notion:33333333-3333-3333-3333-333333333333",
        trashed: true,
      },
    });
    expect(JSON.stringify(result)).not.toContain("secret_notion_token");
  });

  test("restoreDocument patches Notion in_trash false when a token is supplied", async () => {
    const requests: Request[] = [];

    const result = await restoreDocument({
      notionToken: "secret_notion_token",
      pageId: "33333333-3333-3333-3333-333333333333",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json({
          ...searchFixture.results[0],
          in_trash: false,
        });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.notion.com/v1/pages/33333333-3333-3333-3333-333333333333");
    expect(requests[0].method).toBe("PATCH");
    expect(await requests[0].json()).toEqual({ in_trash: false });
    expect(result).toMatchObject({
      connector: "notion",
      action: "documents.restore",
      source: "connector",
      ok: true,
      document: {
        id: "notion:33333333-3333-3333-3333-333333333333",
        trashed: false,
      },
    });
    expect(JSON.stringify(result)).not.toContain("secret_notion_token");
  });

  test("trashDocument maps missing edit capability without leaking token", async () => {
    const result = await trashDocument({
      notionToken: "secret_notion_token",
      pageId: "33333333-3333-3333-3333-333333333333",
      fetch: async () => Response.json({
        object: "error",
        status: 403,
        code: "restricted_resource",
      }, { status: 403 }),
    });

    expect(result).toEqual({
      connector: "notion",
      action: "documents.trash",
      source: "connector",
      ok: false,
      error: {
        code: "CONNECTOR_CAPABILITY_MISSING",
        message: "Notion credentials do not have access to update pages.",
        providerError: "restricted_resource",
      },
    });
    expect(JSON.stringify(result)).not.toContain("secret_notion_token");
  });

  test("getDatabase validates database id without live credentials", () => {
    const result = getDatabase({ databaseId: "44444444-4444-4444-4444-444444444444" });

    expect(result).toEqual({
      connector: "notion",
      action: "databases.get",
      source: "connector",
      validated: {
        databaseId: "44444444-4444-4444-4444-444444444444",
      },
    });
  });

  test("getDatabase retrieves and summarizes a Notion database schema", async () => {
    const requests: Request[] = [];

    const result = await getDatabase({
      notionToken: "secret_notion_token",
      databaseId: "44444444-4444-4444-4444-444444444444",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json(databaseFixture);
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.notion.com/v1/databases/44444444-4444-4444-4444-444444444444");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer secret_notion_token");
    expect(requests[0].headers.get("Notion-Version")).toBe("2026-03-11");
    expect(result).toMatchObject({
      connector: "notion",
      action: "databases.get",
      source: "connector",
      ok: true,
      database: {
        id: "notion:44444444-4444-4444-4444-444444444444",
        title: "Customer Tasks",
        propertyTypes: {
          Name: "title",
          Status: "status",
          Priority: "select",
          Estimate: "number",
          Customer: "relation",
        },
        selectOptions: {
          Priority: [{ id: "high", name: "High", color: "red" }],
        },
        statusOptions: {
          Status: {
            options: [
              { id: "todo", name: "Todo", color: "gray" },
              { id: "done", name: "Done", color: "green" },
            ],
          },
        },
      },
      summary: {
        totalProperties: 5,
        propertyTypes: {
          title: 1,
          status: 1,
          select: 1,
          number: 1,
          relation: 1,
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain("secret_notion_token");
  });

  test("getDatabase maps missing read capability without leaking token", async () => {
    const result = await getDatabase({
      notionToken: "secret_notion_token",
      databaseId: "44444444-4444-4444-4444-444444444444",
      fetch: async () => Response.json({
        object: "error",
        status: 403,
        code: "restricted_resource",
      }, { status: 403 }),
    });

    expect(result).toEqual({
      connector: "notion",
      action: "databases.get",
      source: "connector",
      ok: false,
      error: {
        code: "CONNECTOR_CAPABILITY_MISSING",
        message: "Notion credentials do not have access to retrieve databases.",
        providerError: "restricted_resource",
      },
    });
    expect(JSON.stringify(result)).not.toContain("secret_notion_token");
  });

  test("listDatabaseItems validates query input without live credentials", () => {
    const result = listDatabaseItems({
      databaseId: "44444444-4444-4444-4444-444444444444",
      filters: [
        { property: "Status", type: "status", equals: "Todo" },
      ],
      pageSize: 25,
      cursor: "cursor-1",
    });

    expect(result).toEqual({
      connector: "notion",
      action: "databases.items.query",
      source: "connector",
      validated: {
        databaseId: "44444444-4444-4444-4444-444444444444",
        filters: [
          { property: "Status", type: "status", equals: "Todo" },
        ],
        pageSize: 25,
        cursor: "cursor-1",
      },
    });
  });

  test("listDatabaseItems queries Notion database pages with typed filters", async () => {
    const requests: Request[] = [];

    const result = await listDatabaseItems({
      notionToken: "secret_notion_token",
      databaseId: "44444444-4444-4444-4444-444444444444",
      filters: [
        { property: "Status", type: "status", equals: "Todo" },
        { property: "Estimate", type: "number", equals: 3 },
      ],
      pageSize: 10,
      cursor: "cursor-1",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json(databaseQueryFixture);
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.notion.com/v1/databases/44444444-4444-4444-4444-444444444444/query");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer secret_notion_token");
    expect(requests[0].headers.get("Notion-Version")).toBe("2026-03-11");
    expect(await requests[0].json()).toEqual({
      start_cursor: "cursor-1",
      page_size: 10,
      filter: {
        and: [
          { property: "Status", status: { equals: "Todo" } },
          { property: "Estimate", number: { equals: 3 } },
        ],
      },
    });
    expect(result).toMatchObject({
      connector: "notion",
      action: "databases.items.query",
      source: "connector",
      ok: true,
      cursor: "next-db-cursor",
      items: [
        {
          id: "notion:66666666-6666-6666-6666-666666666666",
          title: "Ship connector query",
          parentType: "database_id",
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("secret_notion_token");
  });

  test("listDatabaseItems maps Notion rate limits without leaking token", async () => {
    const result = await listDatabaseItems({
      notionToken: "secret_notion_token",
      databaseId: "44444444-4444-4444-4444-444444444444",
      fetch: async () => Response.json({
        object: "error",
        status: 429,
        code: "rate_limited",
      }, {
        status: 429,
        headers: { "Retry-After": "7" },
      }),
    });

    expect(result).toEqual({
      connector: "notion",
      action: "databases.items.query",
      source: "connector",
      ok: false,
      error: {
        code: "CONNECTOR_RATE_LIMITED",
        message: "The upstream provider rate limited this request.",
        providerError: "rate_limited",
        retryAfterSeconds: 7,
      },
    });
    expect(JSON.stringify(result)).not.toContain("secret_notion_token");
  });

  test("getDatabaseItem validates page id without live credentials", () => {
    const result = getDatabaseItem({ pageId: "66666666-6666-6666-6666-666666666666" });

    expect(result).toEqual({
      connector: "notion",
      action: "databases.items.get",
      source: "connector",
      validated: {
        pageId: "66666666-6666-6666-6666-666666666666",
      },
    });
  });

  test("getDatabaseItem retrieves a Notion database page when a token is supplied", async () => {
    const requests: Request[] = [];

    const result = await getDatabaseItem({
      notionToken: "secret_notion_token",
      pageId: "66666666-6666-6666-6666-666666666666",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json(databaseQueryFixture.results[0]);
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.notion.com/v1/pages/66666666-6666-6666-6666-666666666666");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer secret_notion_token");
    expect(requests[0].headers.get("Notion-Version")).toBe("2026-03-11");
    expect(result).toMatchObject({
      connector: "notion",
      action: "databases.items.get",
      source: "connector",
      ok: true,
      item: {
        id: "notion:66666666-6666-6666-6666-666666666666",
        title: "Ship connector query",
        parentType: "database_id",
      },
    });
    expect(JSON.stringify(result)).not.toContain("secret_notion_token");
  });

  test("getDatabaseItem maps missing items without leaking token", async () => {
    const result = await getDatabaseItem({
      notionToken: "secret_notion_token",
      pageId: "66666666-6666-6666-6666-666666666666",
      fetch: async () => Response.json({
        object: "error",
        status: 404,
        code: "object_not_found",
      }, { status: 404 }),
    });

    expect(result).toEqual({
      connector: "notion",
      action: "databases.items.get",
      source: "connector",
      ok: false,
      error: {
        code: "CONNECTOR_NOT_FOUND",
        message: "Notion page was not found or is not shared with the integration.",
        providerError: "object_not_found",
      },
    });
    expect(JSON.stringify(result)).not.toContain("secret_notion_token");
  });

  test("createDatabaseItem validates database item input without live credentials", () => {
    const result = createDatabaseItem({
      databaseId: "44444444-4444-4444-4444-444444444444",
      properties: {
        Name: { type: "title", value: "Ship database create" },
        Status: { type: "status", value: "Todo" },
        Estimate: { type: "number", value: 3 },
      },
      content: "Created by appcall.",
    });

    expect(result).toEqual({
      connector: "notion",
      action: "databases.items.create",
      source: "connector",
      validated: {
        databaseId: "44444444-4444-4444-4444-444444444444",
        properties: {
          Name: { type: "title", value: "Ship database create" },
          Status: { type: "status", value: "Todo" },
          Estimate: { type: "number", value: 3 },
        },
        content: "Created by appcall.",
      },
    });
  });

  test("createDatabaseItem posts a Notion database page with typed properties", async () => {
    const requests: Request[] = [];

    const result = await createDatabaseItem({
      notionToken: "secret_notion_token",
      databaseId: "44444444-4444-4444-4444-444444444444",
      properties: {
        Name: { type: "title", value: "Ship database create" },
        Status: { type: "status", value: "Todo" },
        Priority: { type: "select", value: "High" },
        Estimate: { type: "number", value: 3 },
      },
      content: "Created by appcall.",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json(databaseQueryFixture.results[0]);
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.notion.com/v1/pages");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer secret_notion_token");
    expect(requests[0].headers.get("Notion-Version")).toBe("2026-03-11");
    expect(await requests[0].json()).toEqual({
      parent: {
        type: "database_id",
        database_id: "44444444-4444-4444-4444-444444444444",
      },
      properties: {
        Name: { title: [{ text: { content: "Ship database create" } }] },
        Status: { status: { name: "Todo" } },
        Priority: { select: { name: "High" } },
        Estimate: { number: 3 },
      },
      children: [{
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [{
            type: "text",
            text: {
              content: "Created by appcall.",
            },
          }],
        },
      }],
    });
    expect(result).toMatchObject({
      connector: "notion",
      action: "databases.items.create",
      source: "connector",
      ok: true,
      item: {
        id: "notion:66666666-6666-6666-6666-666666666666",
        title: "Ship connector query",
      },
    });
    expect(JSON.stringify(result)).not.toContain("secret_notion_token");
  });

  test("createDatabaseItem maps missing insert-content capability without leaking token", async () => {
    const result = await createDatabaseItem({
      notionToken: "secret_notion_token",
      databaseId: "44444444-4444-4444-4444-444444444444",
      properties: {
        Name: { type: "title", value: "Ship database create" },
      },
      fetch: async () => Response.json({
        object: "error",
        status: 403,
        code: "restricted_resource",
      }, { status: 403 }),
    });

    expect(result).toEqual({
      connector: "notion",
      action: "databases.items.create",
      source: "connector",
      ok: false,
      error: {
        code: "CONNECTOR_CAPABILITY_MISSING",
        message: "Notion credentials do not have access to create pages.",
        providerError: "restricted_resource",
      },
    });
    expect(JSON.stringify(result)).not.toContain("secret_notion_token");
  });

  test("updateDatabaseItem validates database item input without live credentials", () => {
    const result = updateDatabaseItem({
      pageId: "66666666-6666-6666-6666-666666666666",
      properties: {
        Status: { type: "status", value: "Done" },
        Estimate: { type: "number", value: 5 },
      },
    });

    expect(result).toEqual({
      connector: "notion",
      action: "databases.items.update",
      source: "connector",
      validated: {
        pageId: "66666666-6666-6666-6666-666666666666",
        properties: {
          Status: { type: "status", value: "Done" },
          Estimate: { type: "number", value: 5 },
        },
      },
    });
  });

  test("updateDatabaseItem patches a Notion database page with typed properties", async () => {
    const requests: Request[] = [];

    const result = await updateDatabaseItem({
      notionToken: "secret_notion_token",
      pageId: "66666666-6666-6666-6666-666666666666",
      properties: {
        Status: { type: "status", value: "Done" },
        Estimate: { type: "number", value: 5 },
      },
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json(databaseQueryFixture.results[0]);
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.notion.com/v1/pages/66666666-6666-6666-6666-666666666666");
    expect(requests[0].method).toBe("PATCH");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer secret_notion_token");
    expect(requests[0].headers.get("Notion-Version")).toBe("2026-03-11");
    expect(await requests[0].json()).toEqual({
      properties: {
        Status: { status: { name: "Done" } },
        Estimate: { number: 5 },
      },
    });
    expect(result).toMatchObject({
      connector: "notion",
      action: "databases.items.update",
      source: "connector",
      ok: true,
      item: {
        id: "notion:66666666-6666-6666-6666-666666666666",
      },
    });
    expect(JSON.stringify(result)).not.toContain("secret_notion_token");
  });

  test("updateDatabaseItem maps missing edit capability without leaking token", async () => {
    const result = await updateDatabaseItem({
      notionToken: "secret_notion_token",
      pageId: "66666666-6666-6666-6666-666666666666",
      properties: {
        Status: { type: "status", value: "Done" },
      },
      fetch: async () => Response.json({
        object: "error",
        status: 403,
        code: "restricted_resource",
      }, { status: 403 }),
    });

    expect(result).toEqual({
      connector: "notion",
      action: "databases.items.update",
      source: "connector",
      ok: false,
      error: {
        code: "CONNECTOR_CAPABILITY_MISSING",
        message: "Notion credentials do not have access to update pages.",
        providerError: "restricted_resource",
      },
    });
    expect(JSON.stringify(result)).not.toContain("secret_notion_token");
  });

  test("trashDatabaseItem validates page id without live credentials", () => {
    const result = trashDatabaseItem({ pageId: "66666666-6666-6666-6666-666666666666" });

    expect(result).toEqual({
      connector: "notion",
      action: "databases.items.trash",
      source: "connector",
      validated: {
        pageId: "66666666-6666-6666-6666-666666666666",
      },
    });
  });

  test("trashDatabaseItem patches Notion in_trash true when a token is supplied", async () => {
    const requests: Request[] = [];

    const result = await trashDatabaseItem({
      notionToken: "secret_notion_token",
      pageId: "66666666-6666-6666-6666-666666666666",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json({
          ...databaseQueryFixture.results[0],
          in_trash: true,
        });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.notion.com/v1/pages/66666666-6666-6666-6666-666666666666");
    expect(requests[0].method).toBe("PATCH");
    expect(await requests[0].json()).toEqual({ in_trash: true });
    expect(result).toMatchObject({
      connector: "notion",
      action: "databases.items.trash",
      source: "connector",
      ok: true,
      document: {
        id: "notion:66666666-6666-6666-6666-666666666666",
        trashed: true,
      },
    });
    expect(JSON.stringify(result)).not.toContain("secret_notion_token");
  });

  test("restoreDatabaseItem patches Notion in_trash false when a token is supplied", async () => {
    const requests: Request[] = [];

    const result = await restoreDatabaseItem({
      notionToken: "secret_notion_token",
      pageId: "66666666-6666-6666-6666-666666666666",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json({
          ...databaseQueryFixture.results[0],
          in_trash: false,
        });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.notion.com/v1/pages/66666666-6666-6666-6666-666666666666");
    expect(requests[0].method).toBe("PATCH");
    expect(await requests[0].json()).toEqual({ in_trash: false });
    expect(result).toMatchObject({
      connector: "notion",
      action: "databases.items.restore",
      source: "connector",
      ok: true,
      document: {
        id: "notion:66666666-6666-6666-6666-666666666666",
        trashed: false,
      },
    });
    expect(JSON.stringify(result)).not.toContain("secret_notion_token");
  });

  test("listDocumentBlocks validates block list input without live credentials", () => {
    const result = listDocumentBlocks({
      blockId: "33333333-3333-3333-3333-333333333333",
      depth: 2,
      pageSize: 20,
    });

    expect(result).toEqual({
      connector: "notion",
      action: "documents.blocks.list",
      source: "connector",
      validated: {
        blockId: "33333333-3333-3333-3333-333333333333",
        depth: 2,
        pageSize: 20,
      },
    });
  });

  test("listDocumentBlocks retrieves children recursively when a token is supplied", async () => {
    const requests: Request[] = [];

    const result = await listDocumentBlocks({
      notionToken: "secret_notion_token",
      blockId: "33333333-3333-3333-3333-333333333333",
      depth: 2,
      pageSize: 50,
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        if (request.url.includes("44444444-4444-4444-4444-444444444444")) {
          return Response.json({ object: "list", type: "block", block: {}, results: [], next_cursor: null, has_more: false });
        }
        return Response.json(blockFixture);
      },
    });

    expect(requests.map((request) => request.url)).toEqual([
      "https://api.notion.com/v1/blocks/33333333-3333-3333-3333-333333333333/children?page_size=50",
      "https://api.notion.com/v1/blocks/44444444-4444-4444-4444-444444444444/children?page_size=50",
    ]);
    expect(requests[0].headers.get("Authorization")).toBe("Bearer secret_notion_token");
    expect(requests[0].headers.get("Notion-Version")).toBe("2026-03-11");
    expect(result).toMatchObject({
      connector: "notion",
      action: "documents.blocks.list",
      source: "connector",
      ok: true,
      cursor: "next-block-cursor",
      blocks: [{
        id: "notion:44444444-4444-4444-4444-444444444444",
        children: [],
      }],
    });
    expect(JSON.stringify(result)).not.toContain("secret_notion_token");
  });

  test("listDocumentBlocks maps Notion rate limits without leaking token", async () => {
    const result = await listDocumentBlocks({
      notionToken: "secret_notion_token",
      blockId: "33333333-3333-3333-3333-333333333333",
      fetch: async () => Response.json({
        object: "error",
        status: 429,
        code: "rate_limited",
      }, {
        status: 429,
        headers: { "Retry-After": "7" },
      }),
    });

    expect(result).toEqual({
      connector: "notion",
      action: "documents.blocks.list",
      source: "connector",
      ok: false,
      error: {
        code: "CONNECTOR_RATE_LIMITED",
        message: "The upstream provider rate limited this request.",
        providerError: "rate_limited",
        retryAfterSeconds: 7,
      },
    });
    expect(JSON.stringify(result)).not.toContain("secret_notion_token");
  });

  test("appendDocumentText validates append input without live credentials", () => {
    const result = appendDocumentText({
      blockId: "33333333-3333-3333-3333-333333333333",
      text: "Append this paragraph.",
    });

    expect(result).toEqual({
      connector: "notion",
      action: "documents.blocks.append",
      source: "connector",
      validated: {
        blockId: "33333333-3333-3333-3333-333333333333",
        text: "Append this paragraph.",
      },
    });
  });

  test("appendDocumentText patches Notion block children when a token is supplied", async () => {
    const requests: Request[] = [];

    const result = await appendDocumentText({
      notionToken: "secret_notion_token",
      blockId: "33333333-3333-3333-3333-333333333333",
      text: "Append this paragraph.",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json(blockFixture);
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.notion.com/v1/blocks/33333333-3333-3333-3333-333333333333/children");
    expect(requests[0].method).toBe("PATCH");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer secret_notion_token");
    expect(requests[0].headers.get("Notion-Version")).toBe("2026-03-11");
    expect(requests[0].headers.get("Content-Type")).toBe("application/json");
    expect(await requests[0].json()).toEqual({
      children: [{
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [{
            type: "text",
            text: {
              content: "Append this paragraph.",
            },
          }],
        },
      }],
    });
    expect(result).toMatchObject({
      connector: "notion",
      action: "documents.blocks.append",
      source: "connector",
      ok: true,
      blocks: [{
        id: "notion:44444444-4444-4444-4444-444444444444",
      }],
      cursor: "next-block-cursor",
    });
    expect(JSON.stringify(result)).not.toContain("secret_notion_token");
  });

  test("appendDocumentText maps missing insert-content capability without leaking token", async () => {
    const result = await appendDocumentText({
      notionToken: "secret_notion_token",
      blockId: "33333333-3333-3333-3333-333333333333",
      text: "Append this paragraph.",
      fetch: async () => Response.json({
        object: "error",
        status: 403,
        code: "restricted_resource",
      }, { status: 403 }),
    });

    expect(result).toEqual({
      connector: "notion",
      action: "documents.blocks.append",
      source: "connector",
      ok: false,
      error: {
        code: "CONNECTOR_CAPABILITY_MISSING",
        message: "Notion credentials do not have access to append block children.",
        providerError: "restricted_resource",
      },
    });
    expect(JSON.stringify(result)).not.toContain("secret_notion_token");
  });

  test("listComments validates comment list input without live credentials", () => {
    const result = listComments({
      blockId: "33333333-3333-3333-3333-333333333333",
      cursor: "cursor-1",
      pageSize: 25,
    });

    expect(result).toEqual({
      connector: "notion",
      action: "comments.list",
      source: "connector",
      validated: {
        blockId: "33333333-3333-3333-3333-333333333333",
        cursor: "cursor-1",
        pageSize: 25,
      },
    });
  });

  test("listComments retrieves Notion comments when a token is supplied", async () => {
    const requests: Request[] = [];

    const result = await listComments({
      notionToken: "secret_notion_token",
      blockId: "33333333-3333-3333-3333-333333333333",
      cursor: "cursor-1",
      pageSize: 50,
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json(commentsFixture);
      },
    });

    expect(requests.map((request) => request.url)).toEqual([
      "https://api.notion.com/v1/comments?block_id=33333333-3333-3333-3333-333333333333&start_cursor=cursor-1&page_size=50",
    ]);
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer secret_notion_token");
    expect(requests[0].headers.get("Notion-Version")).toBe("2026-03-11");
    expect(result).toMatchObject({
      connector: "notion",
      action: "comments.list",
      source: "connector",
      ok: true,
      cursor: "next-comment-cursor",
      comments: [{
        id: "notion:55555555-5555-5555-5555-555555555555",
        text: "Looks good for the first customer.",
      }],
    });
    expect(JSON.stringify(result)).not.toContain("secret_notion_token");
  });

  test("listComments maps missing read-comment capability without leaking token", async () => {
    const result = await listComments({
      notionToken: "secret_notion_token",
      blockId: "33333333-3333-3333-3333-333333333333",
      fetch: async () => Response.json({
        object: "error",
        status: 403,
        code: "restricted_resource",
      }, { status: 403 }),
    });

    expect(result).toEqual({
      connector: "notion",
      action: "comments.list",
      source: "connector",
      ok: false,
      error: {
        code: "CONNECTOR_CAPABILITY_MISSING",
        message: "Notion credentials do not have read comments capability.",
        providerError: "restricted_resource",
      },
    });
    expect(JSON.stringify(result)).not.toContain("secret_notion_token");
  });

  test("createComment validates comment input without live credentials", () => {
    const result = createComment({
      pageId: "33333333-3333-3333-3333-333333333333",
      text: "Ship the connector.",
    });

    expect(result).toEqual({
      connector: "notion",
      action: "comments.create",
      source: "connector",
      validated: {
        pageId: "33333333-3333-3333-3333-333333333333",
        text: "Ship the connector.",
      },
    });
  });

  test("createComment posts a Notion page comment when a token is supplied", async () => {
    const requests: Request[] = [];

    const result = await createComment({
      notionToken: "secret_notion_token",
      pageId: "33333333-3333-3333-3333-333333333333",
      text: "Ship the connector.",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json(commentsFixture.results[0]);
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.notion.com/v1/comments");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer secret_notion_token");
    expect(requests[0].headers.get("Notion-Version")).toBe("2026-03-11");
    expect(requests[0].headers.get("Content-Type")).toBe("application/json");
    expect(await requests[0].json()).toEqual({
      parent: {
        page_id: "33333333-3333-3333-3333-333333333333",
      },
      rich_text: [{
        text: {
          content: "Ship the connector.",
        },
      }],
    });
    expect(result).toMatchObject({
      connector: "notion",
      action: "comments.create",
      source: "connector",
      ok: true,
      comment: {
        id: "notion:55555555-5555-5555-5555-555555555555",
      },
    });
    expect(JSON.stringify(result)).not.toContain("secret_notion_token");
  });

  test("createComment handles limited Notion comment responses", async () => {
    const result = await createComment({
      notionToken: "secret_notion_token",
      pageId: "33333333-3333-3333-3333-333333333333",
      text: "Ship the connector.",
      fetch: async () => Response.json({
        object: "comment",
        id: "55555555-5555-5555-5555-555555555555",
      }),
    });

    expect(result).toEqual({
      connector: "notion",
      action: "comments.create",
      source: "connector",
      ok: true,
      commentId: "55555555-5555-5555-5555-555555555555",
      comment: null,
      limited: true,
    });
    expect(JSON.stringify(result)).not.toContain("secret_notion_token");
  });

  test("createComment maps missing insert-comment capability without leaking token", async () => {
    const result = await createComment({
      notionToken: "secret_notion_token",
      pageId: "33333333-3333-3333-3333-333333333333",
      text: "Ship the connector.",
      fetch: async () => Response.json({
        object: "error",
        status: 403,
        code: "restricted_resource",
      }, { status: 403 }),
    });

    expect(result).toEqual({
      connector: "notion",
      action: "comments.create",
      source: "connector",
      ok: false,
      error: {
        code: "CONNECTOR_CAPABILITY_MISSING",
        message: "Notion credentials do not have insert comments capability.",
        providerError: "restricted_resource",
      },
    });
    expect(JSON.stringify(result)).not.toContain("secret_notion_token");
  });
});
