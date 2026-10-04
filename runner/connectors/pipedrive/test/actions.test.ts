import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import listFixture from "../fixtures/responses/list.json";
import entityFixture from "../fixtures/responses/entity.json";
import deleteFixture from "../fixtures/responses/delete.json";
import notesListFixture from "../fixtures/responses/notes-list.json";

const { actions } = compileDeclarativeConnector(manifest as never);

type Call = { url: string; init?: RequestInit };

function mockJson(body: unknown, status = 200) {
  const calls: Call[] = [];
  const fetchFn = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(url), init });
    return new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
  return { calls, fetchFn };
}

const ACTION_KEYS = Object.entries(manifest.operations)
  .filter(([, operation]) => (operation as { kind?: string }).kind === "action")
  .map(([key]) => key)
  .sort();

describe("pipedrive connector surface", () => {
  it("compiles one handler per action and skips EventOnly webhooks", () => {
    expect(Object.keys(actions).sort()).toEqual(ACTION_KEYS);
    expect(actions["webhook.deal_added"]).toBeUndefined();
    expect(actions["webhook.person_added"]).toBeUndefined();
    expect(actions["webhook.activity_added"]).toBeUndefined();
  });
});

describe("authentication", () => {
  it("sends the API token as x-api-token", async () => {
    const { calls, fetchFn } = mockJson(listFixture);
    await actions.healthcheck!({ apiKey: "pd-token", fetch: fetchFn });
    expect(new Headers(calls[0]!.init?.headers).get("x-api-token")).toBe("pd-token");
    expect(new URL(calls[0]!.url).hostname).toBe("api.pipedrive.com");
  });

  it("does not issue a live call when no token is supplied", () => {
    expect(actions.healthcheck!({})).toEqual({
      connector: "pipedrive",
      action: "healthcheck",
      source: "connector",
      validated: {},
    });
  });
});

describe("persons", () => {
  it("lists persons with bounded cursor pagination", async () => {
    const { calls, fetchFn } = mockJson(listFixture);
    const result = await actions["persons.list"]!({
      apiKey: "token",
      limit: 10,
      cursor: "cursor-1",
      fetch: fetchFn,
    }) as Record<string, unknown>;
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/api/v2/persons");
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.get("cursor")).toBe("cursor-1");
    expect(result.data).toEqual(listFixture);
  });

  it("requires id on get and reads GET /api/v2/persons/{id}", async () => {
    expect(() => actions["persons.get"]!({})).toThrow("id is required");
    const { calls, fetchFn } = mockJson(entityFixture);
    const result = await actions["persons.get"]!({ apiKey: "token", id: 101, fetch: fetchFn }) as Record<string, unknown>;
    expect(new URL(calls[0]!.url).pathname).toBe("/api/v2/persons/101");
    expect(result.data).toEqual(entityFixture);
  });

  it("creates a person with a JSON body and requires name", async () => {
    expect(() => actions["persons.create"]!({})).toThrow("name is required");
    const { calls, fetchFn } = mockJson(entityFixture);
    const result = await actions["persons.create"]!({
      apiKey: "token",
      name: "Ada Lovelace",
      org_id: 55,
      emails: [{ value: "ada@example.com", primary: true, label: "work" }],
      fetch: fetchFn,
    }) as Record<string, unknown>;
    expect(calls[0]!.init?.method).toBe("POST");
    expect(new URL(calls[0]!.url).pathname).toBe("/api/v2/persons");
    expect(new Headers(calls[0]!.init?.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({
      name: "Ada Lovelace",
      org_id: 55,
      emails: [{ value: "ada@example.com", primary: true, label: "work" }],
    });
    expect(result.data).toEqual(entityFixture);
  });

  it("patches a person and omits fields the caller left out", async () => {
    const { calls, fetchFn } = mockJson(entityFixture);
    await actions["persons.update"]!({ apiKey: "token", id: 101, name: "Ada King", fetch: fetchFn });
    expect(calls[0]!.init?.method).toBe("PATCH");
    expect(new URL(calls[0]!.url).pathname).toBe("/api/v2/persons/101");
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ name: "Ada King" });
  });

  it("deletes a person by id", async () => {
    const { calls, fetchFn } = mockJson(deleteFixture);
    const result = await actions["persons.delete"]!({ apiKey: "token", id: 101, fetch: fetchFn }) as Record<string, unknown>;
    expect(calls[0]!.init?.method).toBe("DELETE");
    expect(new URL(calls[0]!.url).pathname).toBe("/api/v2/persons/101");
    expect(calls[0]!.init?.body).toBeUndefined();
    expect(result.data).toEqual(deleteFixture);
  });
});

describe("organizations", () => {
  it("gets, creates, updates, and deletes organizations on /api/v2/organizations", async () => {
    const get = mockJson(entityFixture);
    await actions["organizations.get"]!({ apiKey: "token", id: 55, fetch: get.fetchFn });
    expect(new URL(get.calls[0]!.url).pathname).toBe("/api/v2/organizations/55");

    const create = mockJson(entityFixture);
    await actions["organizations.create"]!({ apiKey: "token", name: "Analytical Engines", website: "https://example.com", fetch: create.fetchFn });
    expect(create.calls[0]!.init?.method).toBe("POST");
    expect(JSON.parse(String(create.calls[0]!.init?.body))).toEqual({ name: "Analytical Engines", website: "https://example.com" });

    const update = mockJson(entityFixture);
    await actions["organizations.update"]!({ apiKey: "token", id: 55, name: "Analytical Engines Ltd", fetch: update.fetchFn });
    expect(update.calls[0]!.init?.method).toBe("PATCH");

    const del = mockJson(deleteFixture);
    await actions["organizations.delete"]!({ apiKey: "token", id: 55, fetch: del.fetchFn });
    expect(del.calls[0]!.init?.method).toBe("DELETE");
    expect(new URL(del.calls[0]!.url).pathname).toBe("/api/v2/organizations/55");
  });
});

describe("deals", () => {
  it("gets, creates, updates, and deletes deals on /api/v2/deals", async () => {
    const get = mockJson(entityFixture);
    await actions["deals.get"]!({ apiKey: "token", id: 9, fetch: get.fetchFn });
    expect(new URL(get.calls[0]!.url).pathname).toBe("/api/v2/deals/9");

    const create = mockJson(entityFixture);
    await actions["deals.create"]!({
      apiKey: "token",
      title: "Q3 expansion",
      person_id: 101,
      org_id: 55,
      value: 12000,
      currency: "USD",
      fetch: create.fetchFn,
    });
    expect(create.calls[0]!.init?.method).toBe("POST");
    expect(JSON.parse(String(create.calls[0]!.init?.body))).toEqual({
      title: "Q3 expansion",
      person_id: 101,
      org_id: 55,
      value: 12000,
      currency: "USD",
    });

    const update = mockJson(entityFixture);
    await actions["deals.update"]!({ apiKey: "token", id: 9, status: "won", fetch: update.fetchFn });
    expect(update.calls[0]!.init?.method).toBe("PATCH");
    expect(JSON.parse(String(update.calls[0]!.init?.body))).toEqual({ status: "won" });

    const del = mockJson(deleteFixture);
    await actions["deals.delete"]!({ apiKey: "token", id: 9, fetch: del.fetchFn });
    expect(del.calls[0]!.init?.method).toBe("DELETE");
  });
});

describe("activities", () => {
  it("lists activities with optional deal, person, and org filters", async () => {
    const { calls, fetchFn } = mockJson(listFixture);
    await actions["activities.list"]!({ apiKey: "token", limit: 25, deal_id: 9, done: false, fetch: fetchFn });
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/api/v2/activities");
    expect(url.searchParams.get("limit")).toBe("25");
    expect(url.searchParams.get("deal_id")).toBe("9");
    expect(url.searchParams.get("done")).toBe("false");
  });

  it("gets, creates, and updates activities", async () => {
    const get = mockJson(entityFixture);
    await actions["activities.get"]!({ apiKey: "token", id: 77, fetch: get.fetchFn });
    expect(new URL(get.calls[0]!.url).pathname).toBe("/api/v2/activities/77");

    const create = mockJson(entityFixture);
    await actions["activities.create"]!({
      apiKey: "token",
      subject: "Kickoff call",
      type: "call",
      deal_id: 9,
      due_date: "2026-10-08",
      fetch: create.fetchFn,
    });
    expect(create.calls[0]!.init?.method).toBe("POST");
    expect(JSON.parse(String(create.calls[0]!.init?.body))).toEqual({
      subject: "Kickoff call",
      type: "call",
      deal_id: 9,
      due_date: "2026-10-08",
    });

    const update = mockJson(entityFixture);
    await actions["activities.update"]!({ apiKey: "token", id: 77, done: true, fetch: update.fetchFn });
    expect(update.calls[0]!.init?.method).toBe("PATCH");
    expect(JSON.parse(String(update.calls[0]!.init?.body))).toEqual({ done: true });
  });
});

describe("notes", () => {
  it("lists notes on the documented v1 endpoint with start/limit pagination", async () => {
    const { calls, fetchFn } = mockJson(notesListFixture);
    const result = await actions["notes.list"]!({
      apiKey: "token",
      deal_id: 9,
      start: 0,
      limit: 10,
      fetch: fetchFn,
    }) as Record<string, unknown>;
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/api/v1/notes");
    expect(url.searchParams.get("deal_id")).toBe("9");
    expect(url.searchParams.get("start")).toBe("0");
    expect(url.searchParams.get("limit")).toBe("10");
    expect(result.data).toEqual(notesListFixture);
  });

  it("creates a note attached to a deal, person, or organization", async () => {
    const { calls, fetchFn } = mockJson(entityFixture);
    await actions["notes.create"]!({
      apiKey: "token",
      content: "Customer asked for a follow-up next week.",
      deal_id: 9,
      fetch: fetchFn,
    });
    expect(calls[0]!.init?.method).toBe("POST");
    expect(new URL(calls[0]!.url).pathname).toBe("/api/v1/notes");
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({
      content: "Customer asked for a follow-up next week.",
      deal_id: 9,
    });
  });
});

describe("error mapping", () => {
  it("classifies 429 as a rate limit", async () => {
    const { fetchFn } = mockJson({ error: "too many requests" }, 429);
    await expect(actions.healthcheck!({ apiKey: "token", fetch: fetchFn }))
      .rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
  });

  it("surfaces a 401 as CONNECTOR_UPSTREAM_ERROR", async () => {
    const { fetchFn } = mockJson({ success: false, error: "unauthorized" }, 401);
    await expect(actions["persons.list"]!({ apiKey: "bad", fetch: fetchFn }))
      .rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
