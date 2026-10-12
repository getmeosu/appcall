import { describe, expect, it } from "bun:test";
import { defaultConnectorRegistry } from "../../../bun/src/registry";

// SEC-PATH-2: path ids must be rejected as dot segments ("." / "..") before any
// request is built, while documented id shapes with special characters still work.
type Call = string;
function recorder() {
  const calls: Call[] = [];
  const fetch = async (input: RequestInfo | URL) => {
    calls.push(String(input instanceof Request ? input.url : input));
    return new Response(JSON.stringify({ id: 1, data: {}, items: [], resource: {} }), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { calls, fetch };
}
const CONNECTOR = "apollo";
async function run(operation: string, input: Record<string, unknown>): Promise<unknown> {
  const result = defaultConnectorRegistry.executeAction(CONNECTOR, operation, input) as { ok: boolean; output?: unknown; error?: unknown };
  if (result.ok === false) throw result.error ?? result;
  return await result.output;
}

describe("apollo path segment guard", () => {
  it("contacts.update: rejects '.' and '..' in id with zero fetches", async () => {
    for (const bad of [".", ".."]) {
      const { calls, fetch } = recorder();
      const input = { ...{"apiKey": "k"}, "id": bad, fetch };
      await expect((async () => run("contacts.update", input))()).rejects.toBeDefined();
      expect(calls).toHaveLength(0);
    }
  });

  it("contacts.update: keeps a valid id with special characters", async () => {
    const { calls, fetch } = recorder();
    const input = { ...{"apiKey": "k"}, "id": "5f0c7e2a-b1cd_2e00.01", fetch };
    await (async () => run("contacts.update", input))();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.split("?")[0]).toBe("https://api.apollo.io/api/v1/contacts/5f0c7e2a-b1cd_2e00.01");
  });
});

