import { describe, expect, test } from "bun:test";
import { actorsOptions, actorInputSchema } from "../src/options";

function fetchStub(routes: Record<string, unknown>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    const body = routes[url.pathname];
    if (body === undefined) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
}

describe("apify actorsOptions", () => {
  test("merges matching account actors + tasks first, then store results, deduped by id", async () => {
    const fetch = fetchStub({
      "/v2/acts": { data: { items: [{ id: "OWN1", name: "linkedin-helper", username: "me" }] } },
      "/v2/actor-tasks": { data: { items: [{ id: "TASK1", name: "linkedin-daily", username: "me", actId: "OWN1" }] } },
      "/v2/store": { data: { items: [
        { id: "OWN1", name: "linkedin-helper", username: "me", title: "My Helper" },
        { id: "STORE2", name: "linkedin-scraper", username: "get-leads", title: "LinkedIn Scraper" },
      ] } },
    });
    const out = await actorsOptions({ apiKey: "k", search: "linkedin", fetch });
    expect(out.connector).toBe("apify");
    expect(out.options.map((o) => o.id)).toEqual(["me~linkedin-helper", "TASK1", "get-leads~linkedin-scraper"]);
    expect(out.options.find((o) => o.id === "get-leads~linkedin-scraper")).toMatchObject({
      label: "LinkedIn Scraper", source: "store",
    });
    expect(out.options.find((o) => o.id === "TASK1")).toMatchObject({ source: "task" });
  });

  test("filters account actors/tasks by the query (only matching ones are kept)", async () => {
    const fetch = fetchStub({
      "/v2/acts": { data: { items: [
        { id: "A1", name: "linkedin-helper", username: "me" },
        { id: "A2", name: "weather-bot", username: "me" },
      ] } },
      "/v2/actor-tasks": { data: { items: [
        { id: "TLINK", name: "linkedin-daily", username: "me" },
        { id: "TWEATHER", name: "weather-daily", username: "me" },
      ] } },
      "/v2/store": { data: { items: [] } },
    });
    const out = await actorsOptions({ apiKey: "k", search: "linkedin", fetch });
    // weather-bot / weather-daily do not match "linkedin" and must be excluded.
    expect(out.options.map((o) => o.id)).toEqual(["me~linkedin-helper", "TLINK"]);
  });

  test("returns every account actor + task unfiltered when there is no query (browse mode)", async () => {
    const fetch = fetchStub({
      "/v2/acts": { data: { items: [
        { id: "A1", name: "linkedin-helper", username: "me" },
        { id: "A2", name: "weather-bot", username: "me" },
      ] } },
      "/v2/actor-tasks": { data: { items: [{ id: "T1", name: "anything", username: "me" }] } },
    });
    const out = await actorsOptions({ apiKey: "k", search: "", fetch });
    expect(out.options.map((o) => o.id)).toEqual(["me~linkedin-helper", "me~weather-bot", "T1"]);
  });

  test("omits store call when search is empty (account-only)", async () => {
    const calls: string[] = [];
    const fetch = ((async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      calls.push(url.pathname);
      const map: Record<string, unknown> = {
        "/v2/acts": { data: { items: [] } },
        "/v2/actor-tasks": { data: { items: [] } },
      };
      return new Response(JSON.stringify(map[url.pathname] ?? {}), { status: 200 });
    }) as typeof fetch);
    await actorsOptions({ apiKey: "k", search: "", fetch });
    expect(calls).toContain("/v2/acts");
    expect(calls).toContain("/v2/actor-tasks");
    expect(calls).not.toContain("/v2/store");
  });

  test("throws a structured upstream error when the actors listing fails", async () => {
    const fetch = ((async () => new Response("unauthorized", { status: 401 })) as typeof fetch);
    await expect(actorsOptions({ apiKey: "bad", search: "", fetch })).rejects.toMatchObject({
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });

  test("actorInputSchema returns the default build's input schema", async () => {
    const fetch = ((async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      expect(url.pathname).toBe("/v2/actors/get-leads~linkedin-scraper/builds/default");
      return new Response(JSON.stringify({ data: { actorDefinition: { input: {
        title: "Input", type: "object",
        properties: { searchQuery: { title: "Search", type: "string", description: "kw", editor: "textfield" } },
        required: ["searchQuery"],
      } } } }), { status: 200 });
    }) as typeof fetch);
    const out = await actorInputSchema({ apiKey: "k", actorId: "get-leads~linkedin-scraper", fetch });
    expect(out.connector).toBe("apify");
    expect(out.action).toBe("actors.input_schema");
    expect((out.schema as any).properties.searchQuery.type).toBe("string");
    expect((out.schema as any).required).toEqual(["searchQuery"]);
  });

  test("actorInputSchema throws a structured error when the build cannot be loaded", async () => {
    const fetch = ((async () => new Response("not found", { status: 404 })) as typeof fetch);
    await expect(actorInputSchema({ apiKey: "k", actorId: "x~y", fetch }))
      .rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("sends the encoded search term and sortBy to the store", async () => {
    let storeSearch = "";
    const fetch = ((async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      if (url.pathname === "/v2/store") storeSearch = url.search;
      const map: Record<string, unknown> = {
        "/v2/acts": { data: { items: [] } },
        "/v2/actor-tasks": { data: { items: [] } },
        "/v2/store": { data: { items: [] } },
      };
      return new Response(JSON.stringify(map[url.pathname] ?? {}), { status: 200 });
    }) as typeof fetch);
    await actorsOptions({ apiKey: "k", search: "sales rep", fetch });
    expect(storeSearch).toContain("search=sales%20rep");
    expect(storeSearch).toContain("sortBy=relevance");
  });
});
