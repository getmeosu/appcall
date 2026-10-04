import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import fixture from "../fixtures/parties.json";
import contracts from "../fixtures/contracts.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";

const { actions } = compileDeclarativeConnector(manifest);
const response = (body: unknown, status = 200) =>
  new Response(body === null || body === "" ? null : JSON.stringify(body), { status });

describe("capsule crm HTTP contract", () => {
  test("uses bearer auth, encodes page, and does not follow links", async () => {
    const seen: Request[] = [];
    const result = await actions["parties.list"]!({
      apiKey: "secret",
      page: 2,
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response(fixture);
      },
    });
    expect(seen[0].headers.get("authorization")).toBe("Bearer secret");
    expect(new URL(seen[0].url).searchParams.get("page")).toBe("2");
    expect(result).toMatchObject({ parties: fixture.parties });
    expect(seen).toHaveLength(1);
  });

  test("maps unauthorized and malformed responses", async () => {
    await expect(actions.healthcheck!({ apiKey: "secret", fetch: async () => response({}, 401) })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
    await expect(actions["parties.list"]!({ apiKey: "secret", fetch: async () => response({}) })).rejects.toMatchObject({
      code: "CONNECTOR_RESPONSE_INVALID",
    });
  });
});

for (const c of contracts) {
  describe(c.op, () => {
    test("uses the documented request and maps provider output", async () => {
      expect(actions[c.op]).toBeFunction();
      let calls = 0;
      const result = await actions[c.op]!({
        ...c.input,
        apiKey: "secret",
        fetch: async (url: unknown, init?: RequestInit) => {
          calls++;
          expect(String(url)).toBe("https://api.capsulecrm.com/api/v2" + c.path);
          expect(init?.method).toBe(c.method);
          const headers = new Headers(init?.headers);
          expect(headers.get("authorization")).toBe("Bearer secret");
          expect(init?.body === undefined ? null : JSON.parse(String(init.body))).toEqual(c.body);
          return new Response(JSON.stringify(c.response), { status: c.status });
        },
      });
      expect(calls).toBe(1);
      expect(result).toMatchObject(c.output);
    });

    test("rejects missing identifiers before dispatch", async () => {
      const required = Object.keys(c.input);
      if (required.length === 0) return;
      let called = false;
      await expect(
        actions[c.op]!({
          apiKey: "secret",
          fetch: async () => {
            called = true;
            return new Response("{}");
          },
        }),
      ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
      expect(called).toBe(false);
    });
  });
}

test("webhook operations stay event-only", () => {
  const hooks = Object.entries(manifest.operations).filter(([, op]) => op.kind === "webhook");
  expect(hooks.map(([key]) => key).sort()).toEqual([
    "webhook.kase_created",
    "webhook.opportunity_created",
    "webhook.opportunity_updated",
    "webhook.party_created",
    "webhook.party_updated",
    "webhook.task_completed",
  ]);
  for (const [key] of hooks) {
    expect(actions[key]).toBeUndefined();
  }
});
