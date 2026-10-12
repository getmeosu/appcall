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
const CONNECTOR = "linkedin-ads";
async function run(operation: string, input: Record<string, unknown>): Promise<unknown> {
  const result = defaultConnectorRegistry.executeAction(CONNECTOR, operation, input) as { ok: boolean; output?: unknown; error?: unknown };
  if (result.ok === false) throw result.error ?? result;
  return await result.output;
}

describe("linkedin-ads path segment guard", () => {
  it("campaigns.get: rejects '.' and '..' in campaignId with zero fetches", async () => {
    for (const bad of [".", ".."]) {
      const { calls, fetch } = recorder();
      const input = { ...{"accessToken": "t", "accountId": "urn:li:sponsoredAccount:123"}, "campaignId": bad, fetch };
      await expect((async () => run("campaigns.get", input))()).rejects.toBeDefined();
      expect(calls).toHaveLength(0);
    }
  });

  it("campaigns.get: keeps a valid campaignId with special characters", async () => {
    const { calls, fetch } = recorder();
    const input = { ...{"accessToken": "t", "accountId": "urn:li:sponsoredAccount:123"}, "campaignId": "urn:li:sponsoredCampaign:456", fetch };
    await (async () => run("campaigns.get", input))();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.split("?")[0]).toBe("https://api.linkedin.com/rest/adAccounts/123/adCampaigns/456");
  });
});

