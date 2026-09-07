import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import memberMeFixture from "../fixtures/member_me.json";
import cardFixture from "../fixtures/card.json";
import cardsFixture from "../fixtures/cards.json";
import boardFixture from "../fixtures/board.json";
import boardsFixture from "../fixtures/boards.json";
import listFixture from "../fixtures/list.json";
import listsFixture from "../fixtures/lists.json";
import checklistFixture from "../fixtures/checklist.json";
import checkitemFixture from "../fixtures/checkitem.json";
import commentActionFixture from "../fixtures/comment_action.json";
import searchResultsFixture from "../fixtures/search_results.json";
import rateLimitedFixture from "../fixtures/error_rate_limited.json";

const { actions } = compileDeclarativeConnector(manifest as never);

type Call = { url: string; init?: RequestInit };

function mockJson(body: unknown, status = 200, headers: Record<string, string> = {}) {
  const calls: Call[] = [];
  const fetchFn = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(url), init });
    return new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...headers },
    });
  };
  return { calls, fetchFn };
}

function mockText(body: string, status: number, headers: Record<string, string> = {}) {
  const calls: Call[] = [];
  const fetchFn = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(url), init });
    return new Response(body, { status, headers: { "Content-Type": "text/plain", ...headers } });
  };
  return { calls, fetchFn };
}

describe("trello connector surface", () => {
  it("compiles one handler per declared operation", () => {
    expect(Object.keys(actions).sort()).toEqual(Object.keys(manifest.operations).sort());
  });
});

describe("authentication", () => {
  it("carries both apiKey and token as query parameters on every call, since http.auth is singular", async () => {
    const { calls, fetchFn } = mockJson(memberMeFixture);
    await actions.healthcheck!({ apiKey: "my-key", token: "my-token", fetch: fetchFn });
    const url = new URL(calls[0]!.url);
    expect(url.searchParams.get("key")).toBe("my-key");
    expect(url.searchParams.get("token")).toBe("my-token");
  });

  it("declares token as the secret field http.auth.field points at", () => {
    const secretFields = manifest.auth.setup.fields.filter((field) => field.secret);
    expect(secretFields.map((field) => field.key)).toEqual(["token"]);
    expect(manifest.http.auth.field).toBe("token");
  });

  it("does not issue a live call when no token is supplied — the fixture-safe validated echo instead", () => {
    expect(actions.healthcheck!({})).toEqual({
      connector: "trello",
      action: "healthcheck",
      source: "connector",
      status: "ok",
    });
  });
});

describe("healthcheck", () => {
  it("calls GET /members/me with a trimmed field set and reports the authenticated member", async () => {
    const { calls, fetchFn } = mockJson(memberMeFixture);
    const result = await actions.healthcheck!({ apiKey: "k", token: "t", fetch: fetchFn }) as Record<string, unknown>;
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/1/members/me");
    expect(url.searchParams.get("fields")).toBe("id,username,fullName,url");
    expect(calls[0]!.init?.method ?? "GET").toBe("GET");
    expect(result).toEqual({
      connector: "trello",
      action: "healthcheck",
      source: "provider",
      status: "ok",
      id: "5abbe4b7ddc1b351ef961414",
      username: "jdoe",
      fullName: "J Doe",
      url: "https://trello.com/jdoe",
    });
  });
});

describe("card.create", () => {
  it("requires idList", () => {
    expect(() => actions["card.create"]!({ apiKey: "k", token: "t", name: "x" })).toThrow("idList is required");
  });

  it("sends every parameter in the query string, never a JSON body — Trello ignores a body on this POST", async () => {
    const { calls, fetchFn } = mockJson(cardFixture);
    const result = await actions["card.create"]!({
      apiKey: "k",
      token: "t",
      idList: "5f1e9a2b3c4d5e6f7a8b9c0d",
      name: "Draft the release notes",
      desc: "Summarize the 0.9 changes for the changelog.",
      fetch: fetchFn,
    }) as Record<string, unknown>;

    expect(calls[0]!.init?.method).toBe("POST");
    expect(calls[0]!.init?.body).toBeUndefined();
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/1/cards");
    expect(url.searchParams.get("idList")).toBe("5f1e9a2b3c4d5e6f7a8b9c0d");
    expect(url.searchParams.get("name")).toBe("Draft the release notes");
    expect(url.searchParams.get("desc")).toBe("Summarize the 0.9 changes for the changelog.");
    expect(result.card).toEqual(cardFixture);
  });

  it("reads the created card's id from id and its navigable url from shortUrl", async () => {
    const { fetchFn } = mockJson(cardFixture);
    const result = await actions["card.create"]!({
      apiKey: "k", token: "t", idList: "5f1e9a2b3c4d5e6f7a8b9c0d", fetch: fetchFn,
    }) as Record<string, unknown>;
    const card = result.card as Record<string, unknown>;
    expect(card.id).toBe("5f1e9a2b3c4d5e6f7a8b9c1a");
    expect(card.shortUrl).toBe("https://trello.com/c/AbCdEfGh");
  });

  it("repeats an array query parameter rather than sending it as a single comma-joined value", async () => {
    const { calls, fetchFn } = mockJson(cardFixture);
    await actions["card.create"]!({
      apiKey: "k", token: "t", idList: "l1", idMembers: ["m1", "m2"], fetch: fetchFn,
    });
    const url = new URL(calls[0]!.url);
    expect(url.searchParams.getAll("idMembers")).toEqual(["m1", "m2"]);
  });
});

describe("card.get", () => {
  it("requires id", () => {
    expect(() => actions["card.get"]!({ apiKey: "k", token: "t" })).toThrow("id is required");
  });

  it("reads a single card by id", async () => {
    const { calls, fetchFn } = mockJson(cardFixture);
    const result = await actions["card.get"]!({
      apiKey: "k", token: "t", id: "5f1e9a2b3c4d5e6f7a8b9c1a", fetch: fetchFn,
    }) as Record<string, unknown>;
    expect(new URL(calls[0]!.url).pathname).toBe("/1/cards/5f1e9a2b3c4d5e6f7a8b9c1a");
    expect(result.card).toEqual(cardFixture);
  });

  it("surfaces a text/plain error body, which Trello sends on some 400s", async () => {
    const call = actions["card.get"]!({
      apiKey: "k",
      token: "t",
      id: "bad",
      fetch: async () => new Response("invalid id", { status: 400, headers: { "content-type": "text/plain" } }),
    });
    await expect(call).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: "invalid id" });
  });
});

describe("card.update", () => {
  it("requires id", () => {
    expect(() => actions["card.update"]!({ apiKey: "k", token: "t", closed: true })).toThrow("id is required");
  });

  it("PUTs closed=true in the query string as the archive operation, sending no JSON body", async () => {
    const { calls, fetchFn } = mockJson(cardFixture);
    await actions["card.update"]!({
      apiKey: "k", token: "t", id: "5f1e9a2b3c4d5e6f7a8b9c1a", closed: true, fetch: fetchFn,
    });
    expect(calls[0]!.init?.method).toBe("PUT");
    expect(calls[0]!.init?.body).toBeUndefined();
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/1/cards/5f1e9a2b3c4d5e6f7a8b9c1a");
    expect(url.searchParams.get("closed")).toBe("true");
  });

  it("omits fields the caller left out rather than sending them at all", async () => {
    const { calls, fetchFn } = mockJson(cardFixture);
    await actions["card.update"]!({ apiKey: "k", token: "t", id: "c1", name: "New title", fetch: fetchFn });
    const url = new URL(calls[0]!.url);
    expect(url.searchParams.has("closed")).toBe(false);
    expect(url.searchParams.get("name")).toBe("New title");
  });
});

describe("card.delete", () => {
  it("requires id", () => {
    expect(() => actions["card.delete"]!({ apiKey: "k", token: "t" })).toThrow("id is required");
  });

  it("permanently deletes the card and echoes the id back, since Trello's DELETE response carries no id", async () => {
    const { calls, fetchFn } = mockJson({}, 200);
    const result = await actions["card.delete"]!({
      apiKey: "k", token: "t", id: "5f1e9a2b3c4d5e6f7a8b9c1a", fetch: fetchFn,
    }) as Record<string, unknown>;
    expect(calls[0]!.init?.method).toBe("DELETE");
    expect(new URL(calls[0]!.url).pathname).toBe("/1/cards/5f1e9a2b3c4d5e6f7a8b9c1a");
    expect(result).toEqual({
      connector: "trello",
      action: "card.delete",
      source: "provider",
      deleted: true,
      id: "5f1e9a2b3c4d5e6f7a8b9c1a",
    });
  });

  it("also accepts a 204 with no body as a successful delete (exact code unconfirmed pending a live capture)", async () => {
    const { fetchFn } = mockJson(null, 204);
    const result = await actions["card.delete"]!({
      apiKey: "k", token: "t", id: "5f1e9a2b3c4d5e6f7a8b9c1a", fetch: fetchFn,
    }) as Record<string, unknown>;
    expect(result.deleted).toBe(true);
    expect(result.id).toBe("5f1e9a2b3c4d5e6f7a8b9c1a");
  });
});

describe("card.addComment", () => {
  it("requires id and text", () => {
    expect(() => actions["card.addComment"]!({ apiKey: "k", token: "t", id: "c1" })).toThrow("text is required");
    expect(() => actions["card.addComment"]!({ apiKey: "k", token: "t", text: "hi" })).toThrow("id is required");
  });

  it("posts the comment text in the query string and reads back the Action", async () => {
    const { calls, fetchFn } = mockJson(commentActionFixture);
    const result = await actions["card.addComment"]!({
      apiKey: "k", token: "t", id: "5f1e9a2b3c4d5e6f7a8b9c1a", text: "Shipped, moving to review.", fetch: fetchFn,
    }) as Record<string, unknown>;
    expect(calls[0]!.init?.method).toBe("POST");
    expect(calls[0]!.init?.body).toBeUndefined();
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/1/cards/5f1e9a2b3c4d5e6f7a8b9c1a/actions/comments");
    expect(url.searchParams.get("text")).toBe("Shipped, moving to review.");
    const comment = result.comment as Record<string, unknown>;
    expect(comment.id).toBe("5f1e9a2b3c4d5e6f7a8b9c3d");
    expect((comment.data as Record<string, unknown>).text).toBe("Shipped, moving to review.");
  });
});

describe("card.addChecklist", () => {
  it("requires id", () => {
    expect(() => actions["card.addChecklist"]!({ apiKey: "k", token: "t", name: "x" })).toThrow("id is required");
  });

  it("creates a checklist on the card", async () => {
    const { calls, fetchFn } = mockJson(checklistFixture);
    const result = await actions["card.addChecklist"]!({
      apiKey: "k", token: "t", id: "5f1e9a2b3c4d5e6f7a8b9c1a", name: "Launch checklist", fetch: fetchFn,
    }) as Record<string, unknown>;
    expect(new URL(calls[0]!.url).pathname).toBe("/1/cards/5f1e9a2b3c4d5e6f7a8b9c1a/checklists");
    expect(result.checklist).toEqual(checklistFixture);
  });
});

describe("checklist.addItem", () => {
  it("requires id and name", () => {
    expect(() => actions["checklist.addItem"]!({ apiKey: "k", token: "t", id: "cl1" })).toThrow("name is required");
    expect(() => actions["checklist.addItem"]!({ apiKey: "k", token: "t", name: "x" })).toThrow("id is required");
  });

  it("adds an item to the checklist via the checklist id", async () => {
    const { calls, fetchFn } = mockJson(checkitemFixture);
    const result = await actions["checklist.addItem"]!({
      apiKey: "k", token: "t", id: "5f1e9a2b3c4d5e6f7a8b9c2b", name: "Write the changelog", fetch: fetchFn,
    }) as Record<string, unknown>;
    expect(new URL(calls[0]!.url).pathname).toBe("/1/checklists/5f1e9a2b3c4d5e6f7a8b9c2b/checkItems");
    expect(new URL(calls[0]!.url).searchParams.get("name")).toBe("Write the changelog");
    expect(result.checkItem).toEqual(checkitemFixture);
  });
});

describe("list.create", () => {
  it("requires name and idBoard", () => {
    expect(() => actions["list.create"]!({ apiKey: "k", token: "t", idBoard: "b1" })).toThrow("name is required");
    expect(() => actions["list.create"]!({ apiKey: "k", token: "t", name: "x" })).toThrow("idBoard is required");
  });

  it("creates a list on the board via query parameters", async () => {
    const { calls, fetchFn } = mockJson(listFixture);
    const result = await actions["list.create"]!({
      apiKey: "k", token: "t", name: "In review", idBoard: "5f1e9a2b3c4d5e6f7a8b9c0a", fetch: fetchFn,
    }) as Record<string, unknown>;
    expect(calls[0]!.init?.method).toBe("POST");
    expect(calls[0]!.init?.body).toBeUndefined();
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/1/lists");
    expect(url.searchParams.get("name")).toBe("In review");
    expect(url.searchParams.get("idBoard")).toBe("5f1e9a2b3c4d5e6f7a8b9c0a");
    expect(result.list).toEqual(listFixture);
  });
});

describe("list.update", () => {
  it("requires id", () => {
    expect(() => actions["list.update"]!({ apiKey: "k", token: "t", closed: true })).toThrow("id is required");
  });

  it("archives a list with closed=true in the query string", async () => {
    const { calls, fetchFn } = mockJson(listFixture);
    await actions["list.update"]!({ apiKey: "k", token: "t", id: "5f1e9a2b3c4d5e6f7a8b9c0d", closed: true, fetch: fetchFn });
    expect(calls[0]!.init?.method).toBe("PUT");
    expect(calls[0]!.init?.body).toBeUndefined();
    expect(new URL(calls[0]!.url).searchParams.get("closed")).toBe("true");
  });
});

describe("list.getCards", () => {
  it("requires id and returns the entire array with no cursor", async () => {
    expect(() => actions["list.getCards"]!({ apiKey: "k", token: "t" })).toThrow("id is required");
    const { calls, fetchFn } = mockJson(cardsFixture);
    const result = await actions["list.getCards"]!({
      apiKey: "k", token: "t", id: "5f1e9a2b3c4d5e6f7a8b9c0d", fetch: fetchFn,
    }) as Record<string, unknown>;
    expect(new URL(calls[0]!.url).pathname).toBe("/1/lists/5f1e9a2b3c4d5e6f7a8b9c0d/cards");
    expect(result.cards).toEqual(cardsFixture);
    expect("nextOffset" in result).toBe(false);
    expect("cursor" in result).toBe(false);
  });
});

describe("board.create", () => {
  it("requires name", () => {
    expect(() => actions["board.create"]!({ apiKey: "k", token: "t" })).toThrow("name is required");
  });

  it("POSTs to /boards/ with the trailing slash and every parameter in the query string", async () => {
    const { calls, fetchFn } = mockJson(boardFixture);
    const result = await actions["board.create"]!({ apiKey: "k", token: "t", name: "Q3 Launch", fetch: fetchFn }) as Record<string, unknown>;
    expect(calls[0]!.init?.method).toBe("POST");
    expect(calls[0]!.init?.body).toBeUndefined();
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/1/boards/");
    expect(url.searchParams.get("name")).toBe("Q3 Launch");
    expect(result.board).toEqual(boardFixture);
  });

  it("reads the created board's id from id and its navigable url from shortUrl", async () => {
    const { fetchFn } = mockJson(boardFixture);
    const result = await actions["board.create"]!({ apiKey: "k", token: "t", name: "Q3 Launch", fetch: fetchFn }) as Record<string, unknown>;
    const board = result.board as Record<string, unknown>;
    expect(board.id).toBe("5f1e9a2b3c4d5e6f7a8b9c0a");
    expect(board.shortUrl).toBe("https://trello.com/b/AbCdEfGh");
  });
});

describe("board.getLists / board.getCards", () => {
  it("board.getLists requires id and returns the whole list array", async () => {
    expect(() => actions["board.getLists"]!({ apiKey: "k", token: "t" })).toThrow("id is required");
    const { calls, fetchFn } = mockJson(listsFixture);
    const result = await actions["board.getLists"]!({ apiKey: "k", token: "t", id: "5f1e9a2b3c4d5e6f7a8b9c0a", fetch: fetchFn }) as Record<string, unknown>;
    expect(new URL(calls[0]!.url).pathname).toBe("/1/boards/5f1e9a2b3c4d5e6f7a8b9c0a/lists");
    expect(result.lists).toEqual(listsFixture);
  });

  it("board.getCards requires id and returns the whole card array", async () => {
    expect(() => actions["board.getCards"]!({ apiKey: "k", token: "t" })).toThrow("id is required");
    const { calls, fetchFn } = mockJson(cardsFixture);
    const result = await actions["board.getCards"]!({ apiKey: "k", token: "t", id: "5f1e9a2b3c4d5e6f7a8b9c0a", fetch: fetchFn }) as Record<string, unknown>;
    expect(new URL(calls[0]!.url).pathname).toBe("/1/boards/5f1e9a2b3c4d5e6f7a8b9c0a/cards");
    expect(result.cards).toEqual(cardsFixture);
  });
});

describe("member.getBoards", () => {
  it("requires id", () => {
    expect(() => actions["member.getBoards"]!({ apiKey: "k", token: "t" })).toThrow("id is required");
  });

  it("accepts the literal \"me\" for the caller's own boards", async () => {
    const { calls, fetchFn } = mockJson(boardsFixture);
    const result = await actions["member.getBoards"]!({ apiKey: "fixture-api-key", token: "fixture-access-token", id: "me", fetch: fetchFn }) as Record<string, unknown>;
    expect(new URL(calls[0]!.url).pathname).toBe("/1/members/me/boards");
    expect(result.boards).toEqual(boardsFixture);
  });

  it("also accepts a member id or username", async () => {
    const { calls, fetchFn } = mockJson(boardsFixture);
    await actions["member.getBoards"]!({ apiKey: "k", token: "t", id: "jdoe", fetch: fetchFn });
    expect(new URL(calls[0]!.url).pathname).toBe("/1/members/jdoe/boards");
  });
});

describe("search.query", () => {
  it("requires query", () => {
    expect(() => actions["search.query"]!({ apiKey: "k", token: "t" })).toThrow("query is required");
  });

  it("takes camelCase cardsLimit/cardsPage inputs and maps them to the provider's snake_case query params, unlike every other collection endpoint's pagination", async () => {
    const { calls, fetchFn } = mockJson(searchResultsFixture);
    const result = await actions["search.query"]!({
      apiKey: "k", token: "t", query: "launch checklist", cardsLimit: 10, cardsPage: 0, fetch: fetchFn,
    }) as Record<string, unknown>;
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/1/search");
    expect(url.searchParams.get("query")).toBe("launch checklist");
    expect(url.searchParams.get("cards_limit")).toBe("10");
    expect(url.searchParams.get("cards_page")).toBe("0");
    expect(result.results).toEqual(searchResultsFixture);
  });
});

describe("error mapping", () => {
  it("classifies 429 as a rate limit using Trello's documented body shape, with no Retry-After header to read", async () => {
    const { fetchFn } = mockJson(rateLimitedFixture, 429);
    await expect(actions["healthcheck"]!({ apiKey: "k", token: "t", fetch: fetchFn }))
      .rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 10 });
  });

  it("reads the provider's message field first, falling back to the machine error code", async () => {
    const { fetchFn } = mockJson({ message: "invalid value for filter" }, 400);
    await expect(actions["member.getBoards"]!({ apiKey: "fixture-api-key", token: "fixture-access-token", id: "me", fetch: fetchFn }))
      .rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: "invalid value for filter" });
  });

  it("falls back to the error field when message is absent", async () => {
    const { fetchFn } = mockJson({ error: "ERROR" }, 400);
    await expect(actions["member.getBoards"]!({ apiKey: "fixture-api-key", token: "fixture-access-token", id: "me", fetch: fetchFn }))
      .rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: "ERROR" });
  });

  it("surfaces a text/plain error body on card.get, asserting the fallback rather than assuming it", async () => {
    const { fetchFn } = mockText("invalid id", 400);
    await expect(actions["card.get"]!({ apiKey: "k", token: "t", id: "bad", fetch: fetchFn }))
      .rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: "invalid id" });
  });

  it("surfaces a text/plain 404 body on board.getLists too", async () => {
    const { fetchFn } = mockText("invalid id", 404);
    await expect(actions["board.getLists"]!({ apiKey: "k", token: "t", id: "nope", fetch: fetchFn }))
      .rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: "invalid id" });
  });

  it("refuses a host outside the manifest's allow list", async () => {
    const offHost = { ...manifest, network: { allowedHosts: ["example.invalid"] } };
    const compiled = compileDeclarativeConnector(offHost as never);
    await expect(compiled.actions["healthcheck"]!({ apiKey: "k", token: "t", fetch: async () => new Response("{}") }))
      .rejects.toMatchObject({ code: "OUTBOUND_HOST_NOT_ALLOWED" });
  });
});
