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
const CONNECTOR = "unipile";
async function run(operation: string, input: Record<string, unknown>): Promise<unknown> {
  const result = defaultConnectorRegistry.executeAction(CONNECTOR, operation, input) as { ok: boolean; output?: unknown; error?: unknown };
  if (result.ok === false) throw result.error ?? result;
  return await result.output;
}

describe("unipile path segment guard", () => {
  it("linkedin.profile.get: rejects '.' and '..' in identifier with zero fetches", async () => {
    for (const bad of [".", ".."]) {
      const { calls, fetch } = recorder();
      const input = { ...{"apiKey": "k", "dsn": "https://api1.unipile.com:13111", "account_id": "acc"}, "identifier": bad, fetch };
      await expect((async () => run("linkedin.profile.get", input))()).rejects.toBeDefined();
      expect(calls).toHaveLength(0);
    }
  });

  it("linkedin.profile.get: keeps a valid identifier with special characters", async () => {
    const { calls, fetch } = recorder();
    const input = { ...{"apiKey": "k", "dsn": "https://api1.unipile.com:13111", "account_id": "acc"}, "identifier": "j\u00f6hn-doe+1", fetch };
    await (async () => run("linkedin.profile.get", input))();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.split("?")[0]).toBe("https://api1.unipile.com:13111/api/v1/users/j%C3%B6hn-doe%2B1");
  });

  it("chats.get: rejects '.' and '..' in chatId with zero fetches", async () => {
    for (const bad of [".", ".."]) {
      const { calls, fetch } = recorder();
      const input = { ...{"apiKey": "k", "dsn": "https://api1.unipile.com:13111"}, "chatId": bad, fetch };
      await expect((async () => run("chats.get", input))()).rejects.toBeDefined();
      expect(calls).toHaveLength(0);
    }
  });

  it("chats.get: keeps a valid chatId with special characters", async () => {
    const { calls, fetch } = recorder();
    const input = { ...{"apiKey": "k", "dsn": "https://api1.unipile.com:13111"}, "chatId": "Ab_c-D==", fetch };
    await (async () => run("chats.get", input))();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.split("?")[0]).toBe("https://api1.unipile.com:13111/api/v1/chats/Ab_c-D%3D%3D");
  });
});

