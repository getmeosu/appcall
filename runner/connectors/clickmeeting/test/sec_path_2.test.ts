import { describe, expect, it } from "bun:test";
import { actions } from "../src/actions";

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
describe("clickmeeting path segment guard", () => {
  it("send_invitation: rejects '.' and '..' in lang with zero fetches", async () => {
    for (const bad of [".", ".."]) {
      const { calls, fetch } = recorder();
      const input = { ...{"apiKey": "k", "conference_id": 5, "attendees": [{"email": "a@example.com"}]}, "lang": bad, fetch };
      await expect((async () => await actions.send_invitation!(input))()).rejects.toBeDefined();
      expect(calls).toHaveLength(0);
    }
  });

  it("send_invitation: keeps a valid lang with special characters", async () => {
    const { calls, fetch } = recorder();
    const input = { ...{"apiKey": "k", "conference_id": 5, "attendees": [{"email": "a@example.com"}]}, "lang": "pt-BR", fetch };
    await (async () => await actions.send_invitation!(input))();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.split("?")[0]).toBe("https://api.clickmeeting.com/v1/conferences/5/invitation/email/pt-BR");
  });
});

