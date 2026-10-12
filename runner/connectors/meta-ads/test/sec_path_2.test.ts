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
const CONNECTOR = "meta-ads";
async function run(operation: string, input: Record<string, unknown>): Promise<unknown> {
  const result = defaultConnectorRegistry.executeAction(CONNECTOR, operation, input) as { ok: boolean; output?: unknown; error?: unknown };
  if (result.ok === false) throw result.error ?? result;
  return await result.output;
}

describe("meta-ads path segment guard", () => {
  it("campaigns.get: rejects '.' and '..' in campaignId with zero fetches", async () => {
    for (const bad of [".", ".."]) {
      const { calls, fetch } = recorder();
      const input = { ...{"accessToken": "t"}, "campaignId": bad, fetch };
      await expect((async () => run("campaigns.get", input))()).rejects.toBeDefined();
      expect(calls).toHaveLength(0);
    }
  });

  it("campaigns.get: keeps a valid campaignId with special characters", async () => {
    const { calls, fetch } = recorder();
    const input = { ...{"accessToken": "t"}, "campaignId": "120200000000000_1", fetch };
    await (async () => run("campaigns.get", input))();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.split("?")[0]).toBe("https://graph.facebook.com/v26.0/120200000000000_1");
  });

  it("ads.get: rejects '.' and '..' in adId with zero fetches", async () => {
    for (const bad of [".", ".."]) {
      const { calls, fetch } = recorder();
      const input = { ...{"accessToken": "t"}, "adId": bad, fetch };
      await expect((async () => run("ads.get", input))()).rejects.toBeDefined();
      expect(calls).toHaveLength(0);
    }
  });

  it("ads.get: keeps a valid adId with special characters", async () => {
    const { calls, fetch } = recorder();
    const input = { ...{"accessToken": "t"}, "adId": "act_1-2.3", fetch };
    await (async () => run("ads.get", input))();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.split("?")[0]).toBe("https://graph.facebook.com/v26.0/act_1-2.3");
  });
});

