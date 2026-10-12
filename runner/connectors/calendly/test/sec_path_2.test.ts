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
const CONNECTOR = "calendly";
async function run(operation: string, input: Record<string, unknown>): Promise<unknown> {
  const result = defaultConnectorRegistry.executeAction(CONNECTOR, operation, input) as { ok: boolean; output?: unknown; error?: unknown };
  if (result.ok === false) throw result.error ?? result;
  return await result.output;
}

describe("calendly path segment guard", () => {
  it("scheduled_events.get: rejects '.' and '..' in uuid with zero fetches", async () => {
    for (const bad of [".", ".."]) {
      const { calls, fetch } = recorder();
      const input = { ...{"accessToken": "t"}, "uuid": bad, fetch };
      await expect((async () => run("scheduled_events.get", input))()).rejects.toBeDefined();
      expect(calls).toHaveLength(0);
    }
  });

  it("scheduled_events.get: keeps a valid uuid with special characters", async () => {
    const { calls, fetch } = recorder();
    const input = { ...{"accessToken": "t"}, "uuid": "AAAA-BBBB", fetch };
    await (async () => run("scheduled_events.get", input))();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.split("?")[0]).toBe("https://api.calendly.com/scheduled_events/AAAA-BBBB");
  });

  it("users.get: rejects '.' and '..' in uuid with zero fetches", async () => {
    for (const bad of [".", ".."]) {
      const { calls, fetch } = recorder();
      const input = { ...{"accessToken": "t"}, "uuid": bad, fetch };
      await expect((async () => run("users.get", input))()).rejects.toBeDefined();
      expect(calls).toHaveLength(0);
    }
  });

  it("users.get: keeps a valid uuid with special characters", async () => {
    const { calls, fetch } = recorder();
    const input = { ...{"accessToken": "t"}, "uuid": "https://api.calendly.com/users/ABC-123", fetch };
    await (async () => run("users.get", input))();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.split("?")[0]).toBe("https://api.calendly.com/users/ABC-123");
  });
});

