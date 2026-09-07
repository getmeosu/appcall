import { describe, expect, test } from "bun:test";
import { healthcheck } from "../src/healthcheck";

// Innocuous fixture values — NOT realistic secrets.
const ACCESS_TOKEN = "good";
const PHONE_NUMBER_ID = "123";
const GRAPH_VERSION = "v25.0";

describe("whatsapp connector healthcheck", () => {
  // ── Static (no credentials) path ─────────────────────────────────────────

  test("no credentials → static connector status", () => {
    expect(healthcheck()).toEqual({
      connector: "whatsapp",
      status: "ok",
      source: "connector",
    });
  });

  test("undefined input → static connector status", () => {
    expect(healthcheck(undefined)).toEqual({
      connector: "whatsapp",
      status: "ok",
      source: "connector",
    });
  });

  test("only accessToken (no phoneNumberId) → static connector status", () => {
    expect(healthcheck({ accessToken: ACCESS_TOKEN })).toEqual({
      connector: "whatsapp",
      status: "ok",
      source: "connector",
    });
  });

  test("only phoneNumberId (no accessToken) → static connector status", () => {
    expect(healthcheck({ phoneNumberId: PHONE_NUMBER_ID })).toEqual({
      connector: "whatsapp",
      status: "ok",
      source: "connector",
    });
  });

  test("non-object input → static connector status", () => {
    expect(healthcheck("not-an-object")).toEqual({
      connector: "whatsapp",
      status: "ok",
      source: "connector",
    });
  });

  // ── Provider-verified path ────────────────────────────────────────────────

  test("both creds + 200 → source:provider, asserts correct URL and Bearer header", async () => {
    let capturedUrl: string | undefined;
    let capturedAuthHeader: string | undefined;

    const mockFetch: typeof fetch = async (input, init) => {
      capturedUrl = typeof input === "string" ? input : String(input);
      capturedAuthHeader = (init?.headers as Record<string, string>)?.["Authorization"];
      return new Response(JSON.stringify({ id: PHONE_NUMBER_ID, verified_name: "Test Biz", quality_rating: "GREEN" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const result = await healthcheck({ accessToken: ACCESS_TOKEN, phoneNumberId: PHONE_NUMBER_ID, fetch: mockFetch });

    expect(result).toEqual({ connector: "whatsapp", status: "ok", source: "provider" });

    // Verify the correct Graph API URL was called.
    expect(capturedUrl).toContain(`/${GRAPH_VERSION}/${PHONE_NUMBER_ID}`);
    expect(capturedUrl).toContain("graph.facebook.com");

    // Verify the Authorization header carries the access token as Bearer.
    expect(capturedAuthHeader).toBe(`Bearer ${ACCESS_TOKEN}`);
  });

  test("401 response → rejects with CONNECTOR_UPSTREAM_ERROR", async () => {
    const mockFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ error: { message: "Invalid OAuth access token", code: 190 } }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });

    await expect(
      healthcheck({ accessToken: ACCESS_TOKEN, phoneNumberId: PHONE_NUMBER_ID, fetch: mockFetch }),
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("403 response → rejects with CONNECTOR_UPSTREAM_ERROR", async () => {
    const mockFetch: typeof fetch = async () =>
      new Response("{}", { status: 403 });

    await expect(
      healthcheck({ accessToken: ACCESS_TOKEN, phoneNumberId: PHONE_NUMBER_ID, fetch: mockFetch }),
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("429 response → rejects with CONNECTOR_RATE_LIMITED", async () => {
    const mockFetch: typeof fetch = async () =>
      new Response("{}", { status: 429 });

    await expect(
      healthcheck({ accessToken: ACCESS_TOKEN, phoneNumberId: PHONE_NUMBER_ID, fetch: mockFetch }),
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });

  test("transport error (fetch throws) → rejects with CONNECTOR_UNAVAILABLE", async () => {
    const mockFetch: typeof fetch = async () => {
      throw new Error("network failure");
    };

    await expect(
      healthcheck({ accessToken: ACCESS_TOKEN, phoneNumberId: PHONE_NUMBER_ID, fetch: mockFetch }),
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UNAVAILABLE" });
  });

  test("500 response → rejects with CONNECTOR_UPSTREAM_ERROR including HTTP status", async () => {
    const mockFetch: typeof fetch = async () =>
      new Response("{}", { status: 500 });

    await expect(
      healthcheck({ accessToken: ACCESS_TOKEN, phoneNumberId: PHONE_NUMBER_ID, fetch: mockFetch }),
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: expect.stringContaining("500") });
  });
});
