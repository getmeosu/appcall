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
const CONNECTOR = "zendesk";
async function run(operation: string, input: Record<string, unknown>): Promise<unknown> {
  const result = defaultConnectorRegistry.executeAction(CONNECTOR, operation, input) as { ok: boolean; output?: unknown; error?: unknown };
  if (result.ok === false) throw result.error ?? result;
  return await result.output;
}

describe("zendesk path segment guard", () => {
  it("attachments.download: rejects '.' and '..' in attachment_id with zero fetches", async () => {
    for (const bad of [".", ".."]) {
      const { calls, fetch } = recorder();
      const input = { ...{"subdomain": "acme", "email": "a@example.com", "apiToken": "t"}, "attachment_id": bad, fetch };
      await expect((async () => run("attachments.download", input))()).rejects.toBeDefined();
      expect(calls).toHaveLength(0);
    }
  });

  it("attachments.download: keeps a valid attachment_id with special characters", async () => {
    const { calls, fetch } = recorder();
    const input = { ...{"subdomain": "acme", "email": "a@example.com", "apiToken": "t"}, "attachment_id": "abc_1-2", fetch };
    await (async () => run("attachments.download", input))();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.split("?")[0]).toBe("https://acme.zendesk.com/api/v2/attachments/abc_1-2");
  });
});

