import { describe, expect, it } from "bun:test";
import { senderWriteHandlers } from "../src/writes";

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

// The hand-written handler is exported but production dispatch runs this op
// declaratively (template guard, SEC-PATH-1); this covers the handler itself.
describe("sender path segment guard", () => {
  it("subscribers.update: rejects '.' and '..' in subscriber_id with zero fetches", async () => {
    for (const bad of [".", ".."]) {
      const { calls, fetch } = recorder();
      const input = { ...{"apiKey": "k"}, "subscriber_id": bad, fetch };
      await expect((async () => await senderWriteHandlers["subscribers.update"](input))()).rejects.toBeDefined();
      expect(calls).toHaveLength(0);
    }
  });

  it("subscribers.update: keeps a valid subscriber_id with special characters", async () => {
    const { calls, fetch } = recorder();
    const input = { ...{"apiKey": "k"}, "subscriber_id": "a+b@example.com", fetch };
    await (async () => await senderWriteHandlers["subscribers.update"](input))();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.split("?")[0]).toBe("https://api.sender.net/v2/subscribers/a%2Bb%40example.com");
  });
});

