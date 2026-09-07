import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import cases from "../fixtures/contracts.json";

const file = Bun.file(new URL("../manifest.json", import.meta.url));
const manifest = await file.exists() ? await file.json() : { operations: {} };
const actions = manifest.key ? compileDeclarativeConnector(manifest).actions : {};
const credentials = { accessToken: "test-token", instance: "social.example.org" };

describe("mastodon contracts", () => {
  it("implements every curated operation", () => {
    expect(Object.keys(actions).sort()).toEqual(cases.map(c => c.operation).sort());
  });
  for (const c of cases) {
    it(`${c.operation}: fixture-safe echo excludes credentials and unknown input`, () => {
      expect(actions[c.operation]).toBeFunction();
      expect(actions[c.operation]!({ ...c.input, unknown: "drop" })).toMatchObject(c.operation === "healthcheck" ? { source: "connector", status: "ok" } : { source: "connector", validated: c.input });
    });
    it(`${c.operation}: authenticated request and mapped response`, async () => {
      expect(actions[c.operation]).toBeFunction();
      const result = await actions[c.operation]!({ ...credentials, ...c.input, fetch: async (url: string, init: RequestInit) => {
        expect(String(url)).toBe("https://social.example.org" + c.path);
        expect(init.method).toBe(c.method);
        expect(new Headers(init.headers).get("authorization")).toBe("Bearer test-token");
        expect(init.body ? JSON.parse(String(init.body)) : undefined).toEqual("body" in c && c.body !== null ? c.body : undefined);
        return new Response(c.response === null ? null : JSON.stringify(c.response), { status: "status" in c ? c.status : 200, headers: { "content-type": "application/json" } });
      }});
      expect(result).toEqual({ connector: "mastodon", action: c.operation, source: "provider", ...c.result });
    });
    it(`${c.operation}: propagates provider failure`, async () => {
      expect(actions[c.operation]).toBeFunction();
      await expect(actions[c.operation]!({ ...credentials, ...c.input, fetch: async () => new Response(JSON.stringify({ message: "Unauthorized", error: "Unauthorized" }), { status: 401 }) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: "Unauthorized" });
    });
  }
  it("rejects required ids before any provider call", () => {
    expect(() => actions["statuses.get"]!({ ...credentials })).toThrow("statusId is required");
  });
  it("omits unset paging fields", async () => {
    await actions["timelines.home"]!({ ...credentials,  fetch: async (url: string) => {
      expect(new URL(url).search).toBe("");
      return new Response("[]");
    }});
  });
  it("maps 429 and fallback delay", async () => {
    await expect(actions.healthcheck!({ ...credentials, fetch: async () => new Response("{}", { status: 429 }) })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 1800 });
  });
  it("accepts Retry-After seconds", async () => {
    await expect(actions.healthcheck!({ ...credentials, fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "12" } }) })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 12 });
  });
});

it("preserves the paging Link header and empty final page", async () => {
  const link = '<https://social.example.org/api/v1/timelines/home?max_id=788>; rel="next"';
  expect(await actions["timelines.home"]!({ ...credentials, fetch: async () => new Response("[]", { headers: { Link: link } }) })).toMatchObject({ statuses: [], link });
  const final = await actions["timelines.home"]!({ ...credentials, maxId: "788", fetch: async () => new Response("[]") });
  expect(final).toMatchObject({ statuses: [] });
  expect(final).not.toHaveProperty("link");
});
it("refuses to compile an optional caller-controlled instance field", () => {
  expect(() => compileDeclarativeConnector({ ...manifest, auth: { ...manifest.auth, setup: { ...manifest.auth.setup, fields: manifest.auth.setup.fields.map((f: { key: string }) => f.key === "instance" ? { ...f, required: false } : f) } } })).toThrow();
});
it("does not permit a scheme or path in the instance host", async () => {
  await expect(actions.healthcheck!({ ...credentials, instance: "evil.example/path", fetch: async () => { throw new Error("must not fetch"); } })).rejects.toMatchObject({ code: "OUTBOUND_HOST_NOT_ALLOWED" });
});
it("rejects unknown visibility without calling the provider", () => {
  expect(() => actions["statuses.create"]!({ ...credentials, status: "hello", visibility: "unknown" })).toThrow();
});

it("sends a caller-supplied idempotency key unchanged on repeated creates", async () => {
  const key = "publish-release-2026-09-05";
  const seen: string[] = [];
  const fetch = async (_url: string, init: RequestInit) => {
    const headers = new Headers(init.headers);
    expect(headers.get("idempotency-key")).toBe(key);
    expect(JSON.parse(String(init.body))).toEqual({ status: "Release notes" });
    seen.push(headers.get("idempotency-key")!);
    return new Response('{"id":"790","content":"<p>Release notes</p>"}');
  };
  await actions["statuses.create"]!({ ...credentials, status: "Release notes", idempotencyKey: key, fetch });
  await actions["statuses.create"]!({ ...credentials, status: "Release notes", idempotencyKey: key, fetch });
  expect(seen).toEqual([key, key]);
});
it("omits the idempotency header when the caller provides no key", async () => {
  await actions["statuses.create"]!({ ...credentials, status: "Release notes", fetch: async (_url: string, init: RequestInit) => {
    expect(new Headers(init.headers).has("idempotency-key")).toBe(false);
    return new Response('{"id":"790"}');
  }});
});
it("rejects a non-string idempotency key before provider execution", () => {
  expect(() => actions["statuses.create"]!({ ...credentials, status: "Release notes", idempotencyKey: 123 })).toThrow("idempotencyKey must be a string");
});
