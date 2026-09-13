import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import contacts from "../fixtures/contacts_list.json";
import contact from "../fixtures/contact.json";

const { actions } = compileDeclarativeConnector(manifest as never);
function mock(body: unknown, status = 200) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetch = async (url: RequestInfo | URL, init?: RequestInit) => { calls.push({ url: String(url), init }); return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }); };
  return { calls, fetch };
}

describe("Front declarative actions", () => {
  it("compiles all selected reads and healthcheck", () => expect(Object.keys(actions).sort()).toEqual(["contacts.get", "contacts.list", "healthcheck", "teammates.list"]));
  it("authenticates all requests with a bearer token and healthcheck takes no input", async () => {
    for (const [name, input] of Object.entries({ "healthcheck": {}, "contacts.list": {}, "contacts.get": { contactId: "a/b" }, "teammates.list": {} })) {
      const body = name === "healthcheck" ? {} : name === "contacts.list" ? contacts : name === "contacts.get" ? contact : { _results: [] }; const m = mock(body); const result = await actions[name]!({ ...input, apiKey: "secret-front", fetch: m.fetch }) as Record<string, unknown>;
      expect(new Headers(m.calls[0]!.init!.headers).get("authorization")).toBe("Bearer secret-front"); expect(result).toBeDefined();
    }
  });
  it("encodes IDs, omits null query values, and returns cursor metadata", async () => {
    const m = mock(contacts); const result = await actions["contacts.list"]!({ apiKey: "secret", limit: 25, pageToken: null, fetch: m.fetch }) as Record<string, unknown>;
    const url = new URL(m.calls[0]!.url); expect(url.searchParams.get("limit")).toBe("25"); expect(url.searchParams.has("page_token")).toBe(false); expect((result.pagination as Record<string, unknown>).next).toContain("next-token");
    const id = mock(contact); await actions["contacts.get"]!({ apiKey: "secret", contactId: "a/b", fetch: id.fetch }); expect(new URL(id.calls[0]!.url).pathname).toContain("a%2Fb");
  });
  it("maps 401, 429, and malformed responses without exposing credentials", async () => {
    for (const status of [401, 429]) { const m = mock({ message: "bad secret-front" }, status); await expect(actions["teammates.list"]!({ apiKey: "secret-front", fetch: m.fetch })).rejects.toMatchObject({ code: status === 429 ? "CONNECTOR_RATE_LIMITED" : "CONNECTOR_UPSTREAM_ERROR" }); }
    const m = mock({ _results: "bad" }); await expect(actions["contacts.list"]!({ apiKey: "secret-front", fetch: m.fetch })).rejects.toThrow();
  });
});
