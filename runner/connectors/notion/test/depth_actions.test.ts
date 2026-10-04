import { describe, expect, test } from "bun:test";
import {
  getCurrentUser,
  getUser,
  createDatabase,
  retrieveComment,
  deleteBlock,
  getPageProperty,
} from "../src/actions";
import userMeFixture from "../fixtures/user_me.json";
import userGetFixture from "../fixtures/user_get.json";
import createDatabaseFixture from "../fixtures/create_database.json";
import commentRetrieveFixture from "../fixtures/comment_retrieve.json";
import deleteBlockFixture from "../fixtures/delete_block.json";
import pagePropertyFixture from "../fixtures/page_property.json";

describe("getCurrentUser action", () => {
  test("validates input without live credentials", () => {
    const result = getCurrentUser({});
    expect(result).toEqual({
      connector: "notion",
      action: "users.me",
      source: "connector",
      validated: {},
    });
  });

  test("retrieves the current bot user when a token is supplied", async () => {
    const requests: Request[] = [];
    const result = await getCurrentUser({
      notionToken: "secret_notion_token",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json(userMeFixture);
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.notion.com/v1/users/me");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer secret_notion_token");
    expect(requests[0].headers.get("Notion-Version")).toBe("2026-03-11");
    expect(result).toMatchObject({
      connector: "notion",
      action: "users.me",
      source: "connector",
      ok: true,
      user: {
        id: "notion:22222222-2222-2222-2222-222222222222",
        userType: "bot",
        displayName: "Appcall Bot",
      },
    });
    expect(JSON.stringify(result)).not.toContain("secret_notion_token");
  });

  test("maps auth failures without leaking token", async () => {
    const result = await getCurrentUser({
      notionToken: "secret_notion_token",
      fetch: async () => Response.json({
        object: "error",
        status: 401,
        code: "unauthorized",
      }, { status: 401 }),
    });
    expect(result).toMatchObject({
      action: "users.me",
      ok: false,
      error: { code: "AUTHENTICATION_FAILED" },
    });
    expect(JSON.stringify(result)).not.toContain("secret_notion_token");
  });
});

describe("getUser action", () => {
  test("validates input without live credentials", () => {
    const result = getUser({ userId: "11111111-1111-1111-1111-111111111111" });
    expect(result).toEqual({
      connector: "notion",
      action: "users.get",
      source: "connector",
      validated: { userId: "11111111-1111-1111-1111-111111111111" },
    });
  });

  test("throws when userId is missing", () => {
    expect(() => getUser({})).toThrow("userId is required");
  });

  test("retrieves a user by id when a token is supplied", async () => {
    const requests: Request[] = [];
    const result = await getUser({
      notionToken: "secret_notion_token",
      userId: "11111111-1111-1111-1111-111111111111",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json(userGetFixture);
      },
    });
    expect(requests[0].url).toBe("https://api.notion.com/v1/users/11111111-1111-1111-1111-111111111111");
    expect(requests[0].method).toBe("GET");
    expect(result).toMatchObject({
      action: "users.get",
      ok: true,
      user: {
        id: "notion:11111111-1111-1111-1111-111111111111",
        displayName: "Ada Lovelace",
        email: "ada@example.com",
        userType: "person",
      },
    });
  });

  test("maps 404 without leaking token", async () => {
    const result = await getUser({
      notionToken: "secret_notion_token",
      userId: "missing",
      fetch: async () => Response.json({ object: "error", status: 404, code: "object_not_found" }, { status: 404 }),
    });
    expect(result).toMatchObject({
      action: "users.get",
      ok: false,
      error: { code: "CONNECTOR_NOT_FOUND" },
    });
    expect(JSON.stringify(result)).not.toContain("secret_notion_token");
  });
});

describe("createDatabase action", () => {
  test("validates input without live credentials", () => {
    const result = createDatabase({
      parentPageId: "33333333-3333-3333-3333-333333333333",
      title: "Customer Tasks",
    });
    expect(result).toEqual({
      connector: "notion",
      action: "databases.create",
      source: "connector",
      validated: {
        parentPageId: "33333333-3333-3333-3333-333333333333",
        title: "Customer Tasks",
        properties: { Name: { type: "title" } },
      },
    });
  });

  test("throws when parentPageId or title is missing", () => {
    expect(() => createDatabase({ title: "Tasks" })).toThrow("parentPageId is required");
    expect(() => createDatabase({ parentPageId: "page" })).toThrow("title is required");
  });

  test("creates a database when a token is supplied", async () => {
    const requests: Request[] = [];
    const result = await createDatabase({
      notionToken: "secret_notion_token",
      parentPageId: "33333333-3333-3333-3333-333333333333",
      title: "Customer Tasks",
      properties: {
        Name: { type: "title" },
        Status: { type: "select" },
      },
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json(createDatabaseFixture);
      },
    });
    expect(requests[0].url).toBe("https://api.notion.com/v1/databases");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer secret_notion_token");
    expect(requests[0].headers.get("Notion-Version")).toBe("2026-03-11");
    expect(await requests[0].json()).toEqual({
      parent: { type: "page_id", page_id: "33333333-3333-3333-3333-333333333333" },
      title: [{ type: "text", text: { content: "Customer Tasks" } }],
      properties: {
        Name: { title: {} },
        Status: { select: {} },
      },
    });
    expect(result).toMatchObject({
      action: "databases.create",
      ok: true,
      database: {
        id: "notion:44444444-4444-4444-4444-444444444444",
        title: "Customer Tasks",
      },
    });
  });
});

describe("retrieveComment action", () => {
  test("validates input without live credentials", () => {
    const result = retrieveComment({ commentId: "55555555-5555-5555-5555-555555555555" });
    expect(result).toEqual({
      connector: "notion",
      action: "comments.retrieve",
      source: "connector",
      validated: { commentId: "55555555-5555-5555-5555-555555555555" },
    });
  });

  test("throws when commentId is missing", () => {
    expect(() => retrieveComment({})).toThrow("commentId is required");
  });

  test("retrieves a comment when a token is supplied", async () => {
    const requests: Request[] = [];
    const result = await retrieveComment({
      notionToken: "secret_notion_token",
      commentId: "55555555-5555-5555-5555-555555555555",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json(commentRetrieveFixture);
      },
    });
    expect(requests[0].url).toBe("https://api.notion.com/v1/comments/55555555-5555-5555-5555-555555555555");
    expect(requests[0].method).toBe("GET");
    expect(result).toMatchObject({
      action: "comments.retrieve",
      ok: true,
      comment: {
        id: "notion:55555555-5555-5555-5555-555555555555",
        text: "Looks good for the first customer.",
      },
    });
  });
});

describe("deleteBlock action", () => {
  test("validates input without live credentials", () => {
    const result = deleteBlock({ blockId: "44444444-4444-4444-4444-444444444444" });
    expect(result).toEqual({
      connector: "notion",
      action: "blocks.delete",
      source: "connector",
      validated: { blockId: "44444444-4444-4444-4444-444444444444" },
    });
  });

  test("throws when blockId is missing", () => {
    expect(() => deleteBlock({})).toThrow("blockId is required");
  });

  test("deletes a block when a token is supplied", async () => {
    const requests: Request[] = [];
    const result = await deleteBlock({
      notionToken: "secret_notion_token",
      blockId: "44444444-4444-4444-4444-444444444444",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json(deleteBlockFixture);
      },
    });
    expect(requests[0].url).toBe("https://api.notion.com/v1/blocks/44444444-4444-4444-4444-444444444444");
    expect(requests[0].method).toBe("DELETE");
    expect(result).toMatchObject({
      action: "blocks.delete",
      ok: true,
      block: {
        id: "notion:44444444-4444-4444-4444-444444444444",
        blockType: "paragraph",
      },
      deleted: true,
    });
  });
});

describe("getPageProperty action", () => {
  test("validates input without live credentials", () => {
    const result = getPageProperty({
      pageId: "33333333-3333-3333-3333-333333333333",
      propertyId: "title",
    });
    expect(result).toEqual({
      connector: "notion",
      action: "pages.properties.get",
      source: "connector",
      validated: {
        pageId: "33333333-3333-3333-3333-333333333333",
        propertyId: "title",
      },
    });
  });

  test("throws when pageId or propertyId is missing", () => {
    expect(() => getPageProperty({ propertyId: "title" })).toThrow("pageId is required");
    expect(() => getPageProperty({ pageId: "page" })).toThrow("propertyId is required");
  });

  test("retrieves a page property when a token is supplied", async () => {
    const requests: Request[] = [];
    const result = await getPageProperty({
      notionToken: "secret_notion_token",
      pageId: "33333333-3333-3333-3333-333333333333",
      propertyId: "title",
      pageSize: 25,
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json(pagePropertyFixture);
      },
    });
    expect(requests[0].url).toBe(
      "https://api.notion.com/v1/pages/33333333-3333-3333-3333-333333333333/properties/title?page_size=25",
    );
    expect(requests[0].method).toBe("GET");
    expect(result).toMatchObject({
      action: "pages.properties.get",
      ok: true,
      property: {
        object: "property_item",
        id: "title",
        type: "title",
      },
    });
  });
});
