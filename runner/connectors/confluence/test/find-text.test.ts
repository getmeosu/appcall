import { describe, expect, it } from "bun:test";
import { findTextSelections, locateMatches } from "../src/find-text";
import pageFixture from "../fixtures/page.json";

const creds = { site: "acme.atlassian.net", email: "me@acme.com", apiToken: "tok123", basicAuth: "bWU6dG9rMTIz" };

describe("locateMatches", () => {
  it("returns offsets and context for each occurrence", () => {
    const matches = locateMatches("<p>Hello world, hello there</p>", "Hello", {
      maxResults: 25,
      contextChars: 4,
      caseInsensitive: false,
    });
    expect(matches).toEqual([
      { index: 0, start: 3, end: 8, match: "Hello", context: "<p>Hello wor" },
    ]);
  });

  it("honors case_insensitive and max_results without overlapping", () => {
    const matches = locateMatches("AaaAaaAaa", "aa", {
      maxResults: 2,
      contextChars: 0,
      caseInsensitive: true,
    });
    expect(matches.map((match) => match.start)).toEqual([0, 2]);
    expect(matches).toHaveLength(2);
  });
});

describe("findTextSelections handler", () => {
  it("requires page_id and search_text on the echo path", () => {
    expect(() => findTextSelections({ search_text: "Hello" })).toThrow("page_id is required");
    expect(() => findTextSelections({ page_id: "123456" })).toThrow("search_text is required");
  });

  it("GETs the page body and returns matches", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const result = await findTextSelections({
      ...creds,
      page_id: "123456",
      search_text: "Hello",
      fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(url), init });
        return new Response(JSON.stringify(pageFixture), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    }) as Record<string, unknown>;
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/wiki/api/v2/pages/123456");
    expect(url.searchParams.get("body-format")).toBe("storage");
    expect(calls[0]!.init?.headers).toMatchObject({ Authorization: "Basic bWU6dG9rMTIz" });
    expect(result.source).toBe("provider");
    expect(result.count).toBe(1);
    const matches = result.matches as Array<Record<string, unknown>>;
    expect(matches[0]!.match).toBe("Hello");
  });
});

describe("findTextSelections site (SEC-SETUP-1)", () => {
  const fetchNever = async () => { throw new Error("must not fetch"); };
  it("refuses a site that is not <name>.atlassian.net before any request", async () => {
    for (const site of ["evil.example", "acme.atlassian.net.evil.example", "acme.atlassian.net:443", "a@acme.atlassian.net", "acme.atlassian.net/x", "127.0.0.1", "."]) {
      await expect(Promise.resolve().then(() => findTextSelections({ ...creds, site, page_id: "1", search_text: "x", fetch: fetchNever }))).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    }
  });
  it("accepts https:// and a trailing slash", async () => {
    const calls: string[] = [];
    await findTextSelections({
      ...creds, site: "https://ACME.atlassian.net/", page_id: "123456", search_text: "Hello",
      fetch: async (url: RequestInfo | URL) => { calls.push(String(url)); return new Response(JSON.stringify(pageFixture), { status: 200, headers: { "Content-Type": "application/json" } }); },
    });
    expect(new URL(calls[0]!).hostname).toBe("acme.atlassian.net");
  });
});
