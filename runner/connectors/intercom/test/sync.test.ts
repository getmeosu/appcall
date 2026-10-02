import { describe, expect, test } from "bun:test";
import {
  executeHealthcheckSync,
  executeAdminsListSync,
  executeContactsListSync,
  executeContactsGetSync,
  executeCompaniesListSync,
  executeConversationsListSync,
  executeConversationsGetSync,
  executeConversationsSearchSync,
  executeConversationsReplySync,
  executeConversationsCloseSync,
  executeConversationsAssignSync,
  executeConversationsTagSync,
} from "../src/sync";
import adminsFixture from "../fixtures/admins_list.json";
import contactsFixture from "../fixtures/contacts_list.json";
import companiesFixture from "../fixtures/companies_list.json";
import conversationsFixture from "../fixtures/conversations_list.json";
import conversationGetFixture from "../fixtures/conversation_get.json";
import conversationReplyFixture from "../fixtures/conversation_reply.json";
import conversationReplyPrimaryFixture from "../fixtures/conversation_reply_primary.json";
import tagAttachedFixture from "../fixtures/tag_attached.json";
import contactGetFixture from "../fixtures/contact_get.json";
import conversationsSearchFixture from "../fixtures/conversations_search.json";

function stubFetch(body: string, init: { status?: number; headers?: Record<string, string> } = {}) {
  const calls: Request[] = [];
  const impl = (async (input: string | URL | Request, requestInit?: RequestInit) => {
    calls.push(new Request(input as string, requestInit));
    return new Response(body, { status: init.status ?? 200, headers: init.headers });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

const auth = { accessToken: "fixture-intercom-token" };

describe("Intercom healthcheck sync", () => {
  test("GETs /me with Bearer token and Intercom-Version", async () => {
    const { calls, impl } = stubFetch('{"type":"admin","id":"1","name":"Demo"}');

    const result = await executeHealthcheckSync({ ...auth, fetch: impl });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.hostname).toBe("api.intercom.io");
    expect(url.pathname).toBe("/me");
    expect(calls[0].method).toBe("GET");
    expect(calls[0].headers.get("authorization")).toBe("Bearer fixture-intercom-token");
    expect(calls[0].headers.get("intercom-version")).toBe("2.13");
    expect(result.ok).toBe(true);
    expect(result.adminId).toBe("1");
    expect(result.name).toBe("Demo");
  });

  test("rejects missing accessToken before fetch", async () => {
    const { calls, impl } = stubFetch("{}");
    await expect(executeHealthcheckSync({ accessToken: "", fetch: impl })).rejects.toThrow(
      /accessToken/,
    );
    expect(calls).toHaveLength(0);
  });
});

describe("Intercom admins.list sync", () => {
  test("GETs /admins with Bearer on api host", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(adminsFixture));

    const result = await executeAdminsListSync({ ...auth, fetch: impl });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.hostname).toBe("api.intercom.io");
    expect(url.pathname).toBe("/admins");
    expect(calls[0].method).toBe("GET");
    expect(calls[0].headers.get("authorization")).toBe("Bearer fixture-intercom-token");
    expect(result.admins).toHaveLength(2);
    expect(result.admins[0].id).toBe("intercom-admin:991");
  });

  test("forwards display_avatar query", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(adminsFixture));
    await executeAdminsListSync({ ...auth, displayAvatar: true, fetch: impl });
    expect(new URL(calls[0].url).searchParams.get("display_avatar")).toBe("true");
  });
});

describe("Intercom contacts.list sync", () => {
  test("GETs /contacts with pagination params", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(contactsFixture));

    const result = await executeContactsListSync({
      ...auth,
      perPage: 50,
      startingAfter: "cursor-1",
      fetch: impl,
    });

    const url = new URL(calls[0].url);
    expect(url.pathname).toBe("/contacts");
    expect(url.searchParams.get("per_page")).toBe("50");
    expect(url.searchParams.get("starting_after")).toBe("cursor-1");
    expect(result.contacts).toHaveLength(2);
    expect(result.contacts[0].id).toBe("intercom-contact:contact-1");
    expect(result.total).toBe(2);
    expect(result.nextStartingAfter).toBe("contact-cursor-2");
  });

  test("classifies upstream errors", async () => {
    const { impl } = stubFetch("{}", { status: 503 });
    await expect(executeContactsListSync({ ...auth, fetch: impl })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });

  test("classifies a rate limit and carries retry-after", async () => {
    const { impl } = stubFetch("{}", { status: 429, headers: { "retry-after": "30" } });
    await expect(executeContactsListSync({ ...auth, fetch: impl })).rejects.toMatchObject({
      code: "CONNECTOR_RATE_LIMITED",
      retryAfterSeconds: 30,
    });
  });

  test("refuses a redirect rather than following it off the allowed host", async () => {
    const { impl } = stubFetch("", { status: 302, headers: { location: "https://evil.example.net/" } });
    await expect(executeContactsListSync({ ...auth, fetch: impl })).rejects.toMatchObject({
      code: "OUTBOUND_REDIRECT_BLOCKED",
    });
  });
});

describe("Intercom companies.list sync", () => {
  test("POSTs /companies/list with query filters", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(companiesFixture));

    const result = await executeCompaniesListSync({
      ...auth,
      page: 2,
      perPage: 50,
      order: "desc",
      fetch: impl,
    });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.hostname).toBe("api.intercom.io");
    expect(url.pathname).toBe("/companies/list");
    expect(calls[0].method).toBe("POST");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("per_page")).toBe("50");
    expect(url.searchParams.get("order")).toBe("desc");
    expect(result.companies).toHaveLength(1);
    expect(result.companies[0].id).toBe("intercom-company:co-1");
  });
});

describe("Intercom conversations.list sync", () => {
  test("GETs /conversations with Bearer on api host", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(conversationsFixture));

    const result = await executeConversationsListSync({ ...auth, fetch: impl });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.hostname).toBe("api.intercom.io");
    expect(url.pathname).toBe("/conversations");
    expect(calls[0].method).toBe("GET");
    expect(calls[0].headers.get("authorization")).toBe("Bearer fixture-intercom-token");
    expect(calls[0].headers.get("intercom-version")).toBe("2.13");
    expect(result.conversations).toHaveLength(2);
    expect(result.conversations[0].id).toBe("intercom-conversation:147");
    expect(result.conversations[0].title).toBe("Billing question");
    expect(result.total).toBe(2);
    expect(result.nextStartingAfter).toBe("conv-cursor-next");
  });

  test("forwards per_page and starting_after", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(conversationsFixture));
    await executeConversationsListSync({
      ...auth,
      perPage: 20,
      startingAfter: "cursor-abc",
      fetch: impl,
    });
    const url = new URL(calls[0].url);
    expect(url.searchParams.get("per_page")).toBe("20");
    expect(url.searchParams.get("starting_after")).toBe("cursor-abc");
  });

  test("classifies upstream errors", async () => {
    const { impl } = stubFetch("{}", { status: 500 });
    await expect(executeConversationsListSync({ ...auth, fetch: impl })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });
});

describe("Intercom conversations.get sync", () => {
  test("GETs /conversations/{id}", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(conversationGetFixture));

    const result = await executeConversationsGetSync({ ...auth, id: "147", fetch: impl });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.hostname).toBe("api.intercom.io");
    expect(url.pathname).toBe("/conversations/147");
    expect(calls[0].method).toBe("GET");
    expect(result.conversation?.id).toBe("intercom-conversation:147");
    expect(result.conversation?.partCount).toBe(2);
  });

  test("rejects unsafe id before fetch", async () => {
    const { calls, impl } = stubFetch("{}");
    await expect(
      executeConversationsGetSync({ ...auth, id: "../evil", fetch: impl }),
    ).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  test("rejects missing id before fetch", async () => {
    const { calls, impl } = stubFetch("{}");
    await expect(executeConversationsGetSync({ ...auth, id: "", fetch: impl })).rejects.toThrow(
      /id/,
    );
    expect(calls).toHaveLength(0);
  });

  test("classifies upstream errors", async () => {
    const { impl } = stubFetch("{}", { status: 404 });
    await expect(
      executeConversationsGetSync({ ...auth, id: "missing", fetch: impl }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

describe("Intercom conversations.reply sync", () => {
  test("POSTs /conversations/{id}/reply and returns raw Conversation with top-level id", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(conversationReplyPrimaryFixture));

    const result = await executeConversationsReplySync({
      ...auth,
      id: "147",
      messageType: "comment",
      type: "admin",
      adminId: "991",
      body: "Thanks — updated your plan.",
      fetch: impl,
    });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.hostname).toBe("api.intercom.io");
    expect(url.pathname).toBe("/conversations/147/reply");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].headers.get("authorization")).toBe("Bearer fixture-intercom-token");
    expect(calls[0].headers.get("intercom-version")).toBe("2.13");
    expect(calls[0].headers.get("content-type")).toBe("application/json");
    const body = JSON.parse(await calls[0].text());
    expect(body).toEqual({
      message_type: "comment",
      type: "admin",
      admin_id: "991",
      body: "Thanks — updated your plan.",
    });
    // Idempotent: raw primary with top-level id (no normalize / no in-handler GET)
    expect(result.id).toBe("147");
    expect((result as { conversation?: unknown }).conversation).toBeUndefined();
  });

  test("allows id=last as a safe path segment", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(conversationReplyPrimaryFixture));
    await executeConversationsReplySync({
      ...auth,
      id: "last",
      messageType: "note",
      type: "admin",
      adminId: "991",
      body: "Internal note",
      fetch: impl,
    });
    expect(new URL(calls[0].url).pathname).toBe("/conversations/last/reply");
    const body = JSON.parse(await calls[0].text());
    expect(body.message_type).toBe("note");
  });

  test("rejects missing body before fetch", async () => {
    const { calls, impl } = stubFetch("{}");
    await expect(
      executeConversationsReplySync({
        ...auth,
        id: "147",
        messageType: "comment",
        type: "admin",
        adminId: "991",
        body: "",
        fetch: impl,
      }),
    ).rejects.toThrow(/body/);
    expect(calls).toHaveLength(0);
  });

  test("rejects missing adminId before fetch", async () => {
    const { calls, impl } = stubFetch("{}");
    await expect(
      executeConversationsReplySync({
        ...auth,
        id: "147",
        messageType: "comment",
        type: "admin",
        adminId: "",
        body: "hi",
        fetch: impl,
      }),
    ).rejects.toThrow(/adminId/);
    expect(calls).toHaveLength(0);
  });

  test("rejects unsafe id before fetch", async () => {
    const { calls, impl } = stubFetch("{}");
    await expect(
      executeConversationsReplySync({
        ...auth,
        id: "evil/path",
        messageType: "comment",
        type: "admin",
        adminId: "991",
        body: "hi",
        fetch: impl,
      }),
    ).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  test("classifies upstream errors", async () => {
    const { impl } = stubFetch("{}", { status: 403 });
    await expect(
      executeConversationsReplySync({
        ...auth,
        id: "147",
        messageType: "comment",
        type: "admin",
        adminId: "991",
        body: "hi",
        fetch: impl,
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

describe("Intercom conversations.close (Reconcile; POST-only)", () => {
  test("POSTs /conversations/{id}/parts message_type close — conversation null", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(conversationGetFixture));

    const result = await executeConversationsCloseSync({
      ...auth,
      id: "147",
      adminId: "991",
      body: "Closing — resolved.",
      fetch: impl,
    });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.pathname).toBe("/conversations/147/parts");
    expect(calls[0].method).toBe("POST");
    const body = JSON.parse(await calls[0].text());
    expect(body).toEqual({
      message_type: "close",
      type: "admin",
      admin_id: "991",
      body: "Closing — resolved.",
    });
    expect(result.conversation).toBeNull();
  });

  test("rejects missing adminId before fetch", async () => {
    const { calls, impl } = stubFetch("{}");
    await expect(
      executeConversationsCloseSync({ ...auth, id: "147", adminId: "", fetch: impl }),
    ).rejects.toThrow(/adminId/);
    expect(calls).toHaveLength(0);
  });
});

describe("Intercom conversations.assign (Reconcile; POST-only)", () => {
  test("POSTs parts with message_type assignment + assignee_id", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(conversationGetFixture));

    const result = await executeConversationsAssignSync({
      ...auth,
      id: "147",
      adminId: "991",
      assigneeId: "530165",
      body: "Reassigning",
      fetch: impl,
    });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.pathname).toBe("/conversations/147/parts");
    const body = JSON.parse(await calls[0].text());
    expect(body).toEqual({
      message_type: "assignment",
      type: "admin",
      admin_id: "991",
      assignee_id: "530165",
      body: "Reassigning",
    });
    expect(result.conversation).toBeNull();
  });
});

describe("Intercom conversations.tag (Reconcile; discard Tag)", () => {
  test("POSTs /conversations/{id}/tags — conversation null even if tag returned", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(tagAttachedFixture));

    const result = await executeConversationsTagSync({
      ...auth,
      id: "147",
      tagId: "7522907",
      adminId: "991",
      fetch: impl,
    });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.pathname).toBe("/conversations/147/tags");
    const body = JSON.parse(await calls[0].text());
    expect(body).toEqual({ id: "7522907", admin_id: "991" });
    expect(result.conversation).toBeNull();
  });
});

describe("Intercom contacts.get sync", () => {
  test("GETs /contacts/{id}", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(contactGetFixture));

    const result = await executeContactsGetSync({ ...auth, id: "contact-1", fetch: impl });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.pathname).toBe("/contacts/contact-1");
    expect(calls[0].method).toBe("GET");
    expect(result.contact?.id).toBe("intercom-contact:contact-1");
    expect(result.contact?.email).toBe("ada@example.com");
  });

  test("rejects unsafe id before fetch", async () => {
    const { calls, impl } = stubFetch("{}");
    await expect(executeContactsGetSync({ ...auth, id: "../evil", fetch: impl })).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});

describe("Intercom conversations.search sync", () => {
  test("POSTs /conversations/search with query + pagination", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(conversationsSearchFixture));

    const result = await executeConversationsSearchSync({
      ...auth,
      query: { field: "state", operator: "=", value: "open" },
      perPage: 20,
      startingAfter: "cursor-1",
      fetch: impl,
    });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.pathname).toBe("/conversations/search");
    expect(calls[0].method).toBe("POST");
    const body = JSON.parse(await calls[0].text());
    expect(body).toEqual({
      query: { field: "state", operator: "=", value: "open" },
      pagination: { per_page: 20, starting_after: "cursor-1" },
    });
    expect(result.conversations).toHaveLength(1);
    expect(result.conversations[0].id).toBe("intercom-conversation:147");
    expect(result.total).toBe(1);
  });

  test("rejects missing query before fetch", async () => {
    const { calls, impl } = stubFetch("{}");
    await expect(
      executeConversationsSearchSync({
        ...auth,
        query: null as unknown as Record<string, unknown>,
        fetch: impl,
      }),
    ).rejects.toThrow(/query/);
    expect(calls).toHaveLength(0);
  });
});
