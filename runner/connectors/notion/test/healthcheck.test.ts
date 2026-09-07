import { describe, expect, test } from "bun:test";
import { healthcheck } from "../src/healthcheck";
import { notionVersion } from "../src/http";

describe("notion connector healthcheck", () => {
  test("returns connector-owned healthy status when no credential is provided", () => {
    expect(healthcheck()).toEqual({
      connector: "notion",
      status: "ok",
      source: "connector",
    });
  });

  test("returns connector-owned healthy status when input has no notionToken", () => {
    expect(healthcheck({})).toEqual({
      connector: "notion",
      status: "ok",
      source: "connector",
    });
  });

  test("calls GET /v1/users/me with correct headers and returns provider result for a valid token", async () => {
    const capturedRequests: { url: string; init: RequestInit }[] = [];

    const mockFetch = (url: string, init: RequestInit): Promise<Response> => {
      capturedRequests.push({ url, init });
      return Promise.resolve(
        new Response(JSON.stringify({ object: "user", id: "abc123", type: "bot" }), { status: 200 }),
      );
    };

    const result = await healthcheck({ notionToken: "good", fetch: mockFetch });

    expect(result).toEqual({ connector: "notion", status: "ok", source: "provider" });
    expect(capturedRequests).toHaveLength(1);
    expect(capturedRequests[0].url).toBe("https://api.notion.com/v1/users/me");
    expect((capturedRequests[0].init.headers as Record<string, string>)["Authorization"]).toBe("Bearer good");
    expect((capturedRequests[0].init.headers as Record<string, string>)["Notion-Version"]).toBe(notionVersion);
  });

  test("rejects with CONNECTOR_UPSTREAM_ERROR when the token is invalid (401)", async () => {
    const mockFetch = (_url: string, _init: RequestInit): Promise<Response> => {
      return Promise.resolve(
        new Response(JSON.stringify({ code: "unauthorized", message: "API token is invalid." }), { status: 401 }),
      );
    };

    await expect(healthcheck({ notionToken: "bad", fetch: mockFetch })).rejects.toMatchObject({
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });

  test("rejects with CONNECTOR_RATE_LIMITED on 429", async () => {
    const mockFetch = (_url: string, _init: RequestInit): Promise<Response> => {
      return Promise.resolve(new Response(null, { status: 429 }));
    };

    await expect(healthcheck({ notionToken: "good", fetch: mockFetch })).rejects.toMatchObject({
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
    });
  });

  test("rejects with CONNECTOR_UNAVAILABLE on transport error", async () => {
    const mockFetch = (_url: string, _init: RequestInit): Promise<Response> => {
      return Promise.reject(new Error("network failure"));
    };

    await expect(healthcheck({ notionToken: "good", fetch: mockFetch })).rejects.toMatchObject({
      ok: false,
      code: "CONNECTOR_UNAVAILABLE",
    });
  });
});
