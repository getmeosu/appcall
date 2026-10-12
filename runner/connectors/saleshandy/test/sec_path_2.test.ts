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
const CONNECTOR = "saleshandy";
async function run(operation: string, input: Record<string, unknown>): Promise<unknown> {
  const result = defaultConnectorRegistry.executeAction(CONNECTOR, operation, input) as { ok: boolean; output?: unknown; error?: unknown };
  if (result.ok === false) throw result.error ?? result;
  return await result.output;
}

describe("saleshandy path segment guard", () => {
  it("sequences.get: rejects '.' and '..' in sequenceId with zero fetches", async () => {
    for (const bad of [".", ".."]) {
      const { calls, fetch } = recorder();
      const input = { ...{"apiKey": "k"}, "sequenceId": bad, fetch };
      await expect((async () => run("sequences.get", input))()).rejects.toBeDefined();
      expect(calls).toHaveLength(0);
    }
  });

  it("sequences.get: keeps a valid sequenceId with special characters", async () => {
    const { calls, fetch } = recorder();
    const input = { ...{"apiKey": "k"}, "sequenceId": "seq_A-1.b", fetch };
    await (async () => run("sequences.get", input))();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.split("?")[0]).toBe("https://open-api.saleshandy.com/v1/sequences/seq_A-1.b");
  });
});

