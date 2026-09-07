import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import cases from "../fixtures/contracts.json";

const file = Bun.file(new URL("../manifest.json", import.meta.url));
const manifest = await file.exists() ? await file.json() : { operations: {} };
const actions = manifest.key ? compileDeclarativeConnector(manifest).actions : {};
const credentials = { botToken: "test-token" };

describe("discord contracts", () => {
  it("implements every curated operation", () => {
    for (const fixture of cases) expect(actions[fixture.operation], fixture.operation).toBeFunction();
    expect(new Set(cases.map(c => c.operation)).size).toBe(cases.length);
  });
  for (const c of cases) {
    it(`${c.operation}: fixture-safe echo excludes credentials and unknown input`, () => {
      expect(actions[c.operation]).toBeFunction();
      expect(actions[c.operation]!({ ...c.input, unknown: "drop" })).toMatchObject(c.operation === "healthcheck" ? { source: "connector", status: "ok" } : { source: "connector", validated: c.input });
    });
    it(`${c.operation}: authenticated request and mapped response`, async () => {
      expect(actions[c.operation]).toBeFunction();
      const result = await actions[c.operation]!({ ...credentials, ...c.input, fetch: async (url: string, init: RequestInit) => {
        expect(String(url)).toBe("https://discord.com/api/v10" + c.path);
        expect(init.method).toBe(c.method);
        expect(new Headers(init.headers).get("authorization")).toBe("Bot test-token");
        expect(init.body ? JSON.parse(String(init.body)) : undefined).toEqual("body" in c && c.body !== null ? c.body : undefined);
        return new Response(c.response === null ? null : JSON.stringify(c.response), { status: "status" in c ? c.status : 200, headers: { "content-type": "application/json" } });
      }});
      expect(result).toEqual({ connector: "discord", action: c.operation, source: "provider", ...c.result });
    });
    it(`${c.operation}: propagates provider failure`, async () => {
      expect(actions[c.operation]).toBeFunction();
      await expect(actions[c.operation]!({ ...credentials, ...c.input, fetch: async () => new Response(JSON.stringify({ message: "Unauthorized", error: "Unauthorized" }), { status: 401 }) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: "Unauthorized" });
    });
  }
  it("rejects required ids before any provider call", () => {
    expect(() => actions["messages.get"]!({ ...credentials })).toThrow("channelId is required");
  });
  it("omits unset paging fields", async () => {
    await actions["messages.list"]!({ ...credentials, channelId: "456", fetch: async (url: string) => {
      expect(new URL(url).search).toBe("");
      return new Response("[]");
    }});
  });
  it("maps 429 and fallback delay", async () => {
    await expect(actions.healthcheck!({ ...credentials, fetch: async () => new Response("{}", { status: 429 }) })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 5 });
  });
  it("accepts Retry-After seconds", async () => {
    await expect(actions.healthcheck!({ ...credentials, fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "12" } }) })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 12 });
  });
});

it("uses Discord's fractional retry_after body before the header", async () => {
  await expect(actions.healthcheck!({ ...credentials, fetch: async () => new Response('{"retry_after":1.5}', { status: 429, headers: { "retry-after": "99" } }) })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 2 });
});
it("returns an empty final message page", async () => {
  expect(await actions["messages.list"]!({ ...credentials, channelId: "456", before: "788", fetch: async () => new Response("[]") })).toMatchObject({ messages: [] });
});
