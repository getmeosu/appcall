import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest);
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("loops declarative reads", () => {
  test("uses bearer auth and encodes lookup query", async () => {
    const seen: Request[] = [];
    await actions["contacts.find"]!({ apiKey: "secret", email: "a+b@example.com", fetch: async (input, init) => { seen.push(new Request(input, init)); return reply([]); } });
    expect(seen[0].headers.get("authorization")).toBe("Bearer secret");
    expect(new URL(seen[0].url).searchParams.get("email")).toBe("a+b@example.com");
    expect(seen).toHaveLength(1);
  });

  test("rejects omitted and null email before fetch", async () => {
    let calls = 0;
    const fetch = async () => { calls += 1; return reply([]); };
    await expect(actions["contacts.find"]!({ apiKey: "k", fetch })).rejects.toBeDefined();
    await expect(actions["contacts.find"]!({ apiKey: "k", email: null, fetch })).rejects.toBeDefined();
    expect(calls).toBe(0);
  });

  test("rejects invalid output and maps unauthorized errors", async () => {
    await expect(actions["mailing_lists.list"]!({ apiKey: "k", fetch: async () => reply({ nope: true }) })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions.healthcheck!({ apiKey: "k", fetch: async () => reply({ message: "bad" }, 401) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
