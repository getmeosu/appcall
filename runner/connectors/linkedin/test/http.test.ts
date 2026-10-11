import { describe, expect, it } from "bun:test";
import { LINKEDIN_VERSION, createLinkedInClient, isVersionedPath, parseLinkedInRateLimit, parsePagingLinks, withRestliHeaders } from "../src/http";

describe("parseLinkedInRateLimit", () => {
  it("detects 429 with retry-after header", () => {
    const result = parseLinkedInRateLimit(429, { "retry-after": "60" });
    expect(result.limited).toBe(true);
    if (result.limited) expect(result.retryAfterSeconds).toBe(60);
  });

  it("detects 429 with Retry-After header", () => {
    const result = parseLinkedInRateLimit(429, { "Retry-After": "120" });
    expect(result.limited).toBe(true);
    if (result.limited) expect(result.retryAfterSeconds).toBe(120);
  });

  it("defaults to 30 seconds when no retry-after on 429", () => {
    const result = parseLinkedInRateLimit(429, {});
    expect(result.limited).toBe(true);
    if (result.limited) expect(result.retryAfterSeconds).toBe(30);
  });

  it("does not flag 200", () => {
    const result = parseLinkedInRateLimit(200, {});
    expect(result.limited).toBe(false);
  });

  it("does not flag 401", () => {
    const result = parseLinkedInRateLimit(401, {});
    expect(result.limited).toBe(false);
  });
});

describe("parsePagingLinks", () => {
  it("extracts next start from paging links", () => {
    const result = parsePagingLinks({
      paging: {
        count: 10,
        start: 0,
        links: [{ rel: "next", uri: "/v2/posts?start=50&count=10" }],
      },
    });
    expect(result.nextStart).toBe(50);
    expect(result.count).toBe(10);
  });

  it("returns null when no next link", () => {
    const result = parsePagingLinks({
      paging: { count: 5, start: 0, links: [] },
    });
    expect(result.nextStart).toBeNull();
  });

  it("returns null for missing paging", () => {
    expect(parsePagingLinks({}).nextStart).toBeNull();
    expect(parsePagingLinks(null).nextStart).toBeNull();
  });
});

describe("Linkedin-Version on /rest/ only", () => {
  function capture() {
    const seen: Headers[] = [];
    const fetch = ((_url: string, init: RequestInit = {}) => {
      seen.push(new Headers(init.headers as HeadersInit));
      return Promise.resolve(new Response("", { status: 201, headers: { "X-RestLi-Id": "urn:li:share:1" } }));
    }) as unknown as typeof globalThis.fetch;
    return { seen, client: createLinkedInClient({ accessToken: "t", fetch }) };
  }

  it("pins the local version constant", () => {
    expect(LINKEDIN_VERSION).toBe("202609");
  });

  it("sends Linkedin-Version and Rest.li 2.0.0 on /rest/ paths and absolute /rest/ URLs", async () => {
    const { seen, client } = capture();
    await client.fetchJSON("/rest/posts", { method: "POST", body: "{}" });
    await client.fetchJSON("https://api.linkedin.com/rest/images/urn%3Ali%3Aimage%3A1");
    for (const headers of seen) {
      expect(headers.get("linkedin-version")).toBe("202609");
      expect(headers.get("x-restli-protocol-version")).toBe("2.0.0");
    }
  });

  it("never sends Linkedin-Version on /v2/, even if a caller passes one", async () => {
    const { seen, client } = capture();
    await client.fetchJSON("/v2/userinfo");
    await client.fetchJSON("/v2/ugcPosts", { method: "POST", body: "{}", headers: { "LinkedIn-Version": "202401" } });
    for (const headers of seen) {
      expect(headers.get("linkedin-version")).toBeNull();
      expect(headers.get("x-restli-protocol-version")).toBe("2.0.0");
    }
  });

  it("keeps the pinned version on /rest/ over a caller override", async () => {
    const { seen, client } = capture();
    await client.fetchJSON("/rest/posts", { method: "POST", body: "{}", headers: { "linkedin-version": "202401", "X-Restli-Protocol-Version": "1.0.0" } });
    expect(seen[0]!.get("linkedin-version")).toBe("202609");
    expect(seen[0]!.get("x-restli-protocol-version")).toBe("2.0.0");
  });

  it("exposes x-restli-id lowercase from a mixed-case response header", async () => {
    const { client } = capture();
    const result = await client.fetchJSON("/rest/posts", { method: "POST", body: "{}" });
    expect(result.headers["x-restli-id"]).toBe("urn:li:share:1");
  });

  it("classifies versioned paths", () => {
    expect(isVersionedPath("/rest/posts")).toBe(true);
    expect(isVersionedPath("https://api.linkedin.com/rest/videos?action=initializeUpload")).toBe(true);
    expect(isVersionedPath("/v2/userinfo")).toBe(false);
    expect(isVersionedPath("https://api.linkedin.com/v2/ugcPosts")).toBe(false);
    expect(isVersionedPath("https://www.linkedin.com/dms-uploads/rest/x")).toBe(false);
    expect(isVersionedPath("/restricted")).toBe(false);
    expect(withRestliHeaders("/v2/me", { "Linkedin-Version": "202609" })).toEqual({ "X-Restli-Protocol-Version": "2.0.0" });
  });
});
