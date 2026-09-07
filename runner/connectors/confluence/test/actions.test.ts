import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import userCurrentFixture from "../fixtures/user_current.json";
import pageFixture from "../fixtures/page.json";
import pagesFixture from "../fixtures/pages.json";
import spaceFixture from "../fixtures/space.json";
import spacesFixture from "../fixtures/spaces.json";
import searchFixture from "../fixtures/search.json";
import attachmentsFixture from "../fixtures/attachments.json";
import commentFixture from "../fixtures/comment.json";
import errorV2NotFoundFixture from "../fixtures/error_v2_not_found.json";
import errorV1ForbiddenFixture from "../fixtures/error_v1_forbidden.json";
import errorRateLimitedFixture from "../fixtures/error_rate_limited.json";

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

const creds = { site: "acme.atlassian.net", email: "me@acme.com", apiToken: "tok123", basicAuth: "bWU6dG9rMTIz" };

describe("confluence connector surface", () => {
  it("compiles one handler per declared operation", () => {
    expect(Object.keys(actions).sort()).toEqual(Object.keys(manifest.operations).sort());
  });
});

describe("authentication", () => {
  it("carries Authorization: Basic <basicAuth>, not the raw email/token", async () => {
    const { calls, fetchFn } = mockJson(userCurrentFixture);
    await actions.healthcheck!({ ...creds, fetch: fetchFn });
    expect(calls[0]!.init?.headers).toMatchObject({ Authorization: "Basic bWU6dG9rMTIz" });
  });

  it("gates the live call on apiToken (auth.field), not on basicAuth", () => {
    // No apiToken at all -> the fixture-safe validated echo, even with site/email present.
    expect(actions.healthcheck!({ site: "acme.atlassian.net", email: "me@acme.com" })).toEqual({
      connector: "confluence",
      action: "healthcheck",
      source: "connector",
      status: "ok",
    });
  });

  it("does not issue a live call with no credentials at all", () => {
    expect(actions.healthcheck!({})).toEqual({
      connector: "confluence",
      action: "healthcheck",
      source: "connector",
      status: "ok",
    });
  });

  it("never leaks basicAuth into the validated echo, because it is not a declared inputSchema property", () => {
    const echoed = actions["page.create"]!({
      site: "acme.atlassian.net",
      email: "me@acme.com",
      basicAuth: "bWU6dG9rMTIz",
      spaceId: "98765",
      title: "Draft",
    }) as Record<string, unknown>;
    expect(JSON.stringify(echoed)).not.toContain("basicAuth");
    expect(JSON.stringify(echoed)).not.toContain("bWU6dG9rMTIz");
  });
});

describe("per-site host", () => {
  it("builds the base URL from the configured site, and the templated allowlist entry alone admits it (no literal \"*.atlassian.net\" entry needed)", async () => {
    // manifest.network.allowedHosts is just ["{{site}}"] — there is no
    // separate "*.atlassian.net" wildcard entry. This proves the SaaS case
    // still passes: the request reaches fetchFn (rather than throwing
    // OUTBOUND_HOST_NOT_ALLOWED) because {{site}} renders to
    // "acme.atlassian.net" for this request and the allowlist check matches
    // against that rendered value, not a hardcoded wildcard.
    expect(manifest.network.allowedHosts).toEqual(["{{site}}"]);
    const { calls, fetchFn } = mockJson(userCurrentFixture);
    await actions.healthcheck!({ ...creds, fetch: fetchFn });
    const url = new URL(calls[0]!.url);
    expect(url.hostname).toBe("acme.atlassian.net");
    expect(url.pathname).toBe("/wiki/rest/api/user/current");
    expect(url.protocol).toBe("https:");
  });

  it("rejects a request whose rendered host is outside the manifest's allowed hosts", async () => {
    const offHostManifest = { ...manifest, network: { allowedHosts: ["example.invalid"] } };
    const compiled = compileDeclarativeConnector(offHostManifest as never);
    await expect(
      compiled.actions.healthcheck!({ ...creds, fetch: async () => new Response("{}") }),
    ).rejects.toMatchObject({ code: "OUTBOUND_HOST_NOT_ALLOWED" });
  });
});

describe("healthcheck", () => {
  it("calls GET /rest/api/user/current (v1) and reports the authenticated user", async () => {
    const { calls, fetchFn } = mockJson(userCurrentFixture);
    const result = await actions.healthcheck!({ ...creds, fetch: fetchFn }) as Record<string, unknown>;
    expect(calls[0]!.init?.method ?? "GET").toBe("GET");
    expect(new URL(calls[0]!.url).pathname).toBe("/wiki/rest/api/user/current");
    expect(result).toEqual({
      connector: "confluence",
      action: "healthcheck",
      source: "provider",
      status: "ok",
      type: "known",
      accountId: "5b10a2844c20165700ede21g",
      displayName: "Example User",
      email: "example@acme.com",
    });
  });

  it("surfaces the v1 error shape ({message, statusCode}) as CONNECTOR_UPSTREAM_ERROR", async () => {
    const { fetchFn } = mockJson(errorV1ForbiddenFixture, 403);
    await expect(actions.healthcheck!({ ...creds, fetch: fetchFn })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: "Request rejected because caller cannot access Confluence",
    });
  });
});

describe("page.create", () => {
  it("requires spaceId", () => {
    expect(() => actions["page.create"]!({ ...creds, title: "x" })).toThrow("spaceId is required");
  });

  it("sends the numeric-string spaceId and title in the body to POST /api/v2/pages", async () => {
    const { calls, fetchFn } = mockJson(pageFixture, 200);
    await actions["page.create"]!({
      ...creds, spaceId: "98765", title: "New page",
      body: { representation: "storage", value: "<p>Hello</p>" },
      fetch: fetchFn,
    });
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/wiki/api/v2/pages");
    expect(calls[0]!.init?.method).toBe("POST");
    const body = JSON.parse(String(calls[0]!.init?.body));
    expect(body).toMatchObject({ spaceId: "98765", title: "New page" });
  });

  it("maps the created page onto the result", async () => {
    const { fetchFn } = mockJson(pageFixture, 200);
    const result = await actions["page.create"]!({
      ...creds, spaceId: "98765", title: "New page", fetch: fetchFn,
    }) as Record<string, unknown>;
    const page = result.page as Record<string, unknown>;
    expect(page.id).toBe("123456");
    expect(page.spaceId).toBe("98765");
  });

  it("surfaces the v2 error shape (errors[0].detail/title/code) as CONNECTOR_UPSTREAM_ERROR", async () => {
    const { fetchFn } = mockJson(errorV2NotFoundFixture, 404);
    await expect(
      actions["page.create"]!({ ...creds, spaceId: "does-not-exist", title: "x", fetch: fetchFn }),
    ).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
      // detail is null on this fixture, so extraction falls through to title.
      message: "Not Found",
    });
  });
});

describe("page.get", () => {
  it("requires id", () => {
    expect(() => actions["page.get"]!({ ...creds })).toThrow("id is required");
  });

  it("fetches GET /api/v2/pages/{id}", async () => {
    const { calls, fetchFn } = mockJson(pageFixture);
    await actions["page.get"]!({ ...creds, id: "123456", fetch: fetchFn });
    expect(new URL(calls[0]!.url).pathname).toBe("/wiki/api/v2/pages/123456");
  });
});

describe("page.update", () => {
  it("requires all five of id, status, title, body, version — optimistic concurrency", () => {
    const full = { ...creds, id: "123456", status: "current", title: "x", body: { representation: "storage", value: "x" }, version: { number: 2 } };
    for (const omit of ["id", "status", "title", "body", "version"]) {
      const input = { ...full };
      delete (input as Record<string, unknown>)[omit];
      expect(() => actions["page.update"]!(input), omit).toThrow(`${omit} is required`);
    }
  });

  it("sends version.number as current+1 in the PUT body", async () => {
    const { calls, fetchFn } = mockJson(pageFixture, 200);
    await actions["page.update"]!({
      ...creds, id: "123456", status: "current", title: "Updated",
      body: { representation: "storage", value: "<p>x</p>" },
      version: { number: 2, message: "bump" },
      fetch: fetchFn,
    });
    expect(new URL(calls[0]!.url).pathname).toBe("/wiki/api/v2/pages/123456");
    expect(calls[0]!.init?.method).toBe("PUT");
    const body = JSON.parse(String(calls[0]!.init?.body));
    expect(body.version).toEqual({ number: 2, message: "bump" });
    expect(body.id).toBe("123456");
  });
});

describe("page.list", () => {
  it("maps results and the opaque nextLink", async () => {
    const { calls, fetchFn } = mockJson(pagesFixture);
    const result = await actions["page.list"]!({ ...creds, limit: 25, fetch: fetchFn }) as Record<string, unknown>;
    expect(new URL(calls[0]!.url).pathname).toBe("/wiki/api/v2/pages");
    expect(new URL(calls[0]!.url).searchParams.get("limit")).toBe("25");
    expect((result.pages as unknown[]).length).toBe(2);
    expect(result.nextLink).toBe("/wiki/api/v2/pages?cursor=eyJpZCI6IjE2Nzc3MjE4In0&limit=25");
  });

  it("drops nextLink once there is no more data, since an unresolved placeholder disappears", async () => {
    const lastPage = JSON.parse(JSON.stringify(pagesFixture)) as { _links: Record<string, unknown> };
    delete lastPage._links.next;
    const { fetchFn } = mockJson(lastPage);
    const result = await actions["page.list"]!({ ...creds, fetch: fetchFn }) as Record<string, unknown>;
    expect(result.nextLink).toBeUndefined();
  });
});

describe("page.delete", () => {
  it("issues DELETE and reports the deleted id even though the provider returns 204 with no body", async () => {
    const { calls, fetchFn } = mockJson(null, 204);
    const result = await actions["page.delete"]!({ ...creds, id: "123456", fetch: fetchFn }) as Record<string, unknown>;
    expect(calls[0]!.init?.method).toBe("DELETE");
    expect(new URL(calls[0]!.url).pathname).toBe("/wiki/api/v2/pages/123456");
    expect(result).toMatchObject({ deleted: true, id: "123456" });
  });
});

describe("space.list and space.get", () => {
  it("space.list resolves a key to results[0].id, the value page.create's spaceId needs", async () => {
    const { calls, fetchFn } = mockJson(spacesFixture);
    const result = await actions["space.list"]!({ ...creds, keys: ["ENG"], fetch: fetchFn }) as Record<string, unknown>;
    expect(new URL(calls[0]!.url).searchParams.getAll("keys")).toEqual(["ENG"]);
    const spaces = result.spaces as Record<string, unknown>[];
    expect(spaces[0]!.id).toBe("98765");
    expect(spaces[0]!.key).toBe("ENG");
  });

  it("space.get requires id and fetches GET /api/v2/spaces/{id}", async () => {
    expect(() => actions["space.get"]!({ ...creds })).toThrow("id is required");
    const { calls, fetchFn } = mockJson(spaceFixture);
    await actions["space.get"]!({ ...creds, id: "98765", fetch: fetchFn });
    expect(new URL(calls[0]!.url).pathname).toBe("/wiki/api/v2/spaces/98765");
  });
});

describe("search.cql", () => {
  it("requires cql and calls the v1 search endpoint", async () => {
    expect(() => actions["search.cql"]!({ ...creds })).toThrow("cql is required");
    const { calls, fetchFn } = mockJson(searchFixture);
    const result = await actions["search.cql"]!({ ...creds, cql: "type=page", fetch: fetchFn }) as Record<string, unknown>;
    expect(new URL(calls[0]!.url).pathname).toBe("/wiki/rest/api/search");
    expect(new URL(calls[0]!.url).searchParams.get("cql")).toBe("type=page");
    expect((result.results as unknown[]).length).toBe(1);
    expect(result.totalSize).toBe(1);
  });
});

describe("attachment.listForPage", () => {
  it("requires id and lists attachment metadata (no upload support)", async () => {
    expect(() => actions["attachment.listForPage"]!({ ...creds })).toThrow("id is required");
    const { calls, fetchFn } = mockJson(attachmentsFixture);
    const result = await actions["attachment.listForPage"]!({ ...creds, id: "123456", fetch: fetchFn }) as Record<string, unknown>;
    expect(new URL(calls[0]!.url).pathname).toBe("/wiki/api/v2/pages/123456/attachments");
    expect((result.attachments as unknown[]).length).toBe(1);
  });
});

describe("comment.create", () => {
  it("requires body and posts to /api/v2/footer-comments", async () => {
    expect(() => actions["comment.create"]!({ ...creds, pageId: "123456" })).toThrow("body is required");
    const { calls, fetchFn } = mockJson(commentFixture, 201);
    const result = await actions["comment.create"]!({
      ...creds, pageId: "123456", body: { representation: "storage", value: "<p>Nice!</p>" }, fetch: fetchFn,
    }) as Record<string, unknown>;
    expect(new URL(calls[0]!.url).pathname).toBe("/wiki/api/v2/footer-comments");
    expect(calls[0]!.init?.method).toBe("POST");
    const comment = result.comment as Record<string, unknown>;
    expect(comment.id).toBe("c98765");
  });
});

describe("rate limiting", () => {
  it("reports CONNECTOR_RATE_LIMITED with retryAfterSeconds from the retry-after header", async () => {
    const { fetchFn } = mockJson(errorRateLimitedFixture, 429, { "retry-after": "42" });
    await expect(actions.healthcheck!({ ...creds, fetch: fetchFn })).rejects.toMatchObject({
      code: "CONNECTOR_RATE_LIMITED",
      retryAfterSeconds: 42,
    });
  });
});
