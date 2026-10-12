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
const CONNECTOR = "zoom";
async function run(operation: string, input: Record<string, unknown>): Promise<unknown> {
  const result = defaultConnectorRegistry.executeAction(CONNECTOR, operation, input) as { ok: boolean; output?: unknown; error?: unknown };
  if (result.ok === false) throw result.error ?? result;
  return await result.output;
}

describe("zoom path segment guard", () => {
  it("meetings.get: rejects '.' and '..' in meetingId with zero fetches", async () => {
    for (const bad of [".", ".."]) {
      const { calls, fetch } = recorder();
      const input = { ...{"accessToken": "t"}, "meetingId": bad, fetch };
      await expect((async () => run("meetings.get", input))()).rejects.toBeDefined();
      expect(calls).toHaveLength(0);
    }
  });

  it("meetings.get: keeps a valid meetingId with special characters", async () => {
    const { calls, fetch } = recorder();
    const input = { ...{"accessToken": "t"}, "meetingId": "4444AAA+iiiAAAA==", fetch };
    await (async () => run("meetings.get", input))();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.split("?")[0]).toBe("https://api.zoom.us/v2/meetings/4444AAA%2BiiiAAAA%3D%3D");
  });

  it("users.get: rejects '.' and '..' in userId with zero fetches", async () => {
    for (const bad of [".", ".."]) {
      const { calls, fetch } = recorder();
      const input = { ...{"accessToken": "t"}, "userId": bad, fetch };
      await expect((async () => run("users.get", input))()).rejects.toBeDefined();
      expect(calls).toHaveLength(0);
    }
  });

  it("users.get: keeps a valid userId with special characters", async () => {
    const { calls, fetch } = recorder();
    const input = { ...{"accessToken": "t"}, "userId": "a+b@example.com", fetch };
    await (async () => run("users.get", input))();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.split("?")[0]).toBe("https://api.zoom.us/v2/users/a%2Bb%40example.com");
  });

  it("past_meetings.participants: rejects '.' and '..' in meetingUUID with zero fetches", async () => {
    for (const bad of [".", ".."]) {
      const { calls, fetch } = recorder();
      const input = { ...{"accessToken": "t"}, "meetingUUID": bad, fetch };
      await expect((async () => run("past_meetings.participants", input))()).rejects.toBeDefined();
      expect(calls).toHaveLength(0);
    }
  });

  it("past_meetings.participants: keeps a valid meetingUUID with special characters", async () => {
    const { calls, fetch } = recorder();
    const input = { ...{"accessToken": "t"}, "meetingUUID": "/ajXp112QmuoKj4854875==", fetch };
    await (async () => run("past_meetings.participants", input))();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.split("?")[0]).toBe("https://api.zoom.us/v2/past_meetings/%252FajXp112QmuoKj4854875%253D%253D/participants");
  });
});

