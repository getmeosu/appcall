import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createPost } from "../src/actions";
import createPostFixture from "../fixtures/create_post.json";

type Call = { url: string; init: RequestInit };

function mockFetchSeq(responses: Response[]) {
  const calls: Call[] = [];
  const fn = (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    const next = responses.shift();
    if (!next) throw new Error(`unexpected request ${String(url)}`);
    return Promise.resolve(next);
  };
  return { fn: fn as unknown as typeof fetch, calls };
}

const created = (urn = "urn:li:share:6844785523593134080", name = "x-restli-id") =>
  new Response(null, { status: 201, headers: { [name]: urn } });
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const hdr = (c: Call, name: string) => new Headers(c.init.headers as HeadersInit).get(name);
const sentBody = (c: Call) => JSON.parse(c.init.body as string) as Record<string, any>;
const userinfo = JSON.parse(readFileSync(join(import.meta.dir, "../fixtures/profile_userinfo.json"), "utf8"));
const MEMBER = "urn:li:person:abc123def";

describe("createPost action", () => {
  it("validates input without accessToken", () => {
    const result = createPost({ text: "Hello world", visibility: "PUBLIC" });
    expect(result.connector).toBe("linkedin");
    expect(result.action).toBe("posts.create");
    expect((result as any).validated.text).toBe("Hello world");
  });

  it("throws when text is missing", () => {
    expect(() => createPost({ visibility: "PUBLIC" })).toThrow("text is required");
  });

  it("throws for non-object input", () => {
    expect(() => createPost("not an object")).toThrow("create post input must be an object");
  });

  it("POSTs the exact Posts API body to /rest/posts with the version headers", async () => {
    const { fn, calls } = mockFetchSeq([created()]);
    const result = await createPost({ accessToken: "test-token", text: "Hello from the connector!", authorUrn: MEMBER, fetch: fn }) as any;
    expect(calls).toHaveLength(1);
    const c = calls[0]!;
    expect(c.url).toBe("https://api.linkedin.com/rest/posts");
    expect(c.init.method).toBe("POST");
    expect(hdr(c, "linkedin-version")).toBe("202609");
    expect(hdr(c, "x-restli-protocol-version")).toBe("2.0.0");
    expect(hdr(c, "content-type")).toBe("application/json");
    expect(hdr(c, "authorization")).toBe("Bearer test-token");
    expect(sentBody(c)).toEqual(createPostFixture);
    const body = sentBody(c);
    for (const field of ["specificContent", "shareCommentary", "shareMediaCategory", "targetAudience", "title", "content"]) expect(field in body).toBe(false);
    expect(typeof body.visibility).toBe("string");
    expect(result.post.id).toBe("li-post:6844785523593134080");
    expect(result.post.providerPostId).toBe("6844785523593134080");
    expect(result.post.raw.id).toBe("urn:li:share:6844785523593134080");
    expect(result.post.text).toBe("Hello from the connector!");
    expect(result.post.authorId).toBe("abc123def");
    expect(result.post.visibility).toBe("PUBLIC");
    expect(result.post.postType).toBe("PUBLISHED");
  });

  it("passes visibility through and ignores title", async () => {
    const { fn, calls } = mockFetchSeq([created()]);
    await createPost({ accessToken: "t", text: "x", visibility: "CONNECTIONS", title: "T", authorUrn: MEMBER, fetch: fn });
    const body = sentBody(calls[0]!);
    expect(body.visibility).toBe("CONNECTIONS");
    expect("title" in body).toBe(false);
    expect("content" in body).toBe(false);
  });

  it("little-escapes commentary and returns the original text", async () => {
    const { fn, calls } = mockFetchSeq([created()]);
    const text = "Hi (team) @all [x] {y} <z> #tag a*b_c~d|e\\f";
    const result = await createPost({ accessToken: "t", text, authorUrn: MEMBER, fetch: fn }) as any;
    expect(sentBody(calls[0]!).commentary).toBe("Hi \\(team\\) \\@all \\[x\\] \\{y\\} \\<z\\> \\#tag a\\*b\\_c\\~d\\|e\\\\f");
    expect(result.post.text).toBe(text);
  });

  it("resolves the default author from /v2/userinfo sub without Linkedin-Version", async () => {
    const { fn, calls } = mockFetchSeq([json(200, userinfo), created()]);
    await createPost({ accessToken: "t", text: "hi", fetch: fn });
    expect(calls).toHaveLength(2);
    expect(calls[0]!.url).toBe("https://api.linkedin.com/v2/userinfo");
    expect(String(calls[0]!.init.method ?? "GET")).toBe("GET");
    expect(hdr(calls[0]!, "linkedin-version")).toBeNull();
    expect(hdr(calls[0]!, "x-restli-protocol-version")).toBe("2.0.0");
    expect(calls[1]!.url).toBe("https://api.linkedin.com/rest/posts");
    expect(sentBody(calls[1]!).author).toBe("urn:li:person:abc123def");
    for (const c of calls) expect(String(c.init.body ?? "")).not.toContain("urn:li:person:me");
  });

  it("uses an explicit member authorUrn raw, with no userinfo call", async () => {
    const { fn, calls } = mockFetchSeq([created()]);
    await createPost({ accessToken: "t", text: "hi", authorUrn: "urn:li:person:782bbtaQ", fetch: fn });
    expect(calls).toHaveLength(1);
    expect(sentBody(calls[0]!).author).toBe("urn:li:person:782bbtaQ");
  });

  it("refuses organization, me, and malformed authors before any request", () => {
    const { fn, calls } = mockFetchSeq([]);
    expect(() => createPost({ accessToken: "t", text: "hi", authorUrn: "urn:li:organization:5515715", fetch: fn })).toThrow("member only");
    expect(() => createPost({ accessToken: "t", text: "hi", authorUrn: "urn:li:person:me", fetch: fn })).toThrow("urn:li:person:{id}");
    expect(() => createPost({ accessToken: "t", text: "hi", authorUrn: "abc", fetch: fn })).toThrow("urn:li:person:{id}");
    expect(() => createPost({ text: "hi", authorUrn: "urn:li:organization:1" })).toThrow("member only");
    expect(() => createPost({ accessToken: "t", text: "hi", visibility: "LOGGED_IN", fetch: fn })).toThrow("visibility must be one of");
    expect(calls).toHaveLength(0);
  });

  it("fails when userinfo has no sub or is rejected, without posting", async () => {
    const noSub = mockFetchSeq([json(200, { name: "Jane" })]);
    await expect(createPost({ accessToken: "t", text: "hi", fetch: noSub.fn }) as Promise<unknown>).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    expect(noSub.calls).toHaveLength(1);
    const denied = mockFetchSeq([json(401, { status: 401, serviceErrorCode: 65600, code: "INVALID_ACCESS_TOKEN", message: "Invalid access token" })]);
    await expect(createPost({ accessToken: "t", text: "hi", fetch: denied.fn }) as Promise<unknown>).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    expect(denied.calls).toHaveLength(1);
  });

  it("reads x-restli-id case-insensitively and tolerates the ugcPost form", async () => {
    const { fn } = mockFetchSeq([created("urn:li:ugcPost:68447855235931240", "X-RestLi-Id")]);
    const result = await createPost({ accessToken: "t", text: "hi", authorUrn: MEMBER, fetch: fn }) as any;
    expect(result.post.id).toBe("li-post:68447855235931240");
    expect(result.post.raw.id).toBe("urn:li:ugcPost:68447855235931240");
  });

  it("maps 429 to CONNECTOR_RATE_LIMITED without falling back", async () => {
    const { fn, calls } = mockFetchSeq([json(429, { status: 429, message: "Resource level throttle limit" }, { "retry-after": "60" })]);
    await expect(createPost({ accessToken: "t", text: "hi", authorUrn: MEMBER, fetch: fn }) as Promise<unknown>)
      .rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 60 });
    expect(calls).toHaveLength(1);
  });
});

type Scenario = {
  id: string;
  input: Record<string, unknown>;
  exchanges: Array<{
    request: { method: string; url: string; headers: Record<string, string>; absentHeaders?: string[]; body: string | null };
    response: { status: number; headers: Record<string, string>; body: unknown };
  }>;
  expected: { kind: "success"; post: Record<string, string> } | { kind: "error"; code: string; messageIncludes?: string };
};

describe("posts.create wire scenarios (fixtures/posts_create)", () => {
  const dir = join(import.meta.dir, "../fixtures/posts_create");
  const files = readdirSync(dir).filter((name) => name.endsWith(".json")).sort();

  it("covers success, ACCESS_DENIED fallback, and no-fallback errors", () => {
    expect(files).toEqual([
      "rest-201-missing-restli-id.json",
      "rest-400-no-fallback.json",
      "rest-403-access-denied-falls-back-to-ugc.json",
      "rest-403-legacy-permission-shape-falls-back.json",
      "rest-403-no-body-no-fallback.json",
      "rest-403-other-code-no-fallback.json",
      "rest-422-no-fallback.json",
      "rest-created-default-author.json",
      "rest-created-explicit-author.json",
      "ugc-fallback-rejected-stops.json",
    ]);
  });

  for (const file of files) {
    const scenario = JSON.parse(readFileSync(join(dir, file), "utf8")) as Scenario;
    it(scenario.id, async () => {
      let index = 0;
      const fetch = async (url: string | URL | Request, init: RequestInit = {}) => {
        const exchange = scenario.exchanges[index++];
        if (!exchange) throw new Error(`${scenario.id}: extra request ${String(url)}`);
        expect(String(url)).toBe(exchange.request.url);
        expect(String(init.method ?? "GET").toUpperCase()).toBe(exchange.request.method);
        if (exchange.request.body === null) expect(init.body == null || init.body === "").toBe(true);
        else expect(init.body).toBe(exchange.request.body);
        const got = new Headers(init.headers as HeadersInit);
        for (const [name, value] of Object.entries(exchange.request.headers)) expect(got.get(name)).toBe(value);
        for (const name of exchange.request.absentHeaders ?? []) expect(got.get(name)).toBeNull();
        expect(String(init.body ?? "")).not.toContain("urn:li:person:me");
        const { status, headers, body } = exchange.response;
        return new Response(body === null ? null : JSON.stringify(body), { status, headers });
      };
      const run = createPost({ ...scenario.input, accessToken: "test-value", fetch }) as Promise<Record<string, any>>;
      if (scenario.expected.kind === "success") {
        const result = await run;
        const want = scenario.expected.post;
        expect(result.post.id).toBe(want.id);
        expect(result.post.providerPostId).toBe(want.providerPostId);
        expect(result.post.authorId).toBe(want.authorId);
        expect(result.post.text).toBe(want.text);
        expect(result.post.visibility).toBe(want.visibility);
        expect(result.post.postType).toBe(want.postType);
        expect(result.post.raw.id).toBe(want.rawId);
      } else {
        const error = await run.then(() => null, (e) => e);
        expect(error).toMatchObject({ ok: false, code: scenario.expected.code });
        if (scenario.expected.messageIncludes) expect(String(error.message)).toContain(scenario.expected.messageIncludes);
      }
      expect(index).toBe(scenario.exchanges.length);
    });
  }
});
