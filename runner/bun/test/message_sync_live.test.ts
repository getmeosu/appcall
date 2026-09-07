import { expect, test } from "bun:test";
import { createFetchHandler } from "../src/serve";

test("real RPC fetches Slack history with trusted credentials and provider cursor", async () => {
  const nativeFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (url: any, init: any) => {
    calls.push(String(url));
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer stored-token");
    expect(new URL(String(url)).searchParams.get("cursor")).toBe("page-1");
    return Response.json({ ok: true, messages: [{ ts: "123", user: "U1", text: "hello" }], response_metadata: { next_cursor: "page-2" } });
  }) as typeof fetch;
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: createFetchHandler() });
  try {
    const response = await nativeFetch(`http://127.0.0.1:${server.port}/rpc`, { method: "POST", body: JSON.stringify({ id: "sync", method: "connector.sync.list", params: { connectorKey: "slack", sync: "messages.list", input: { channelId: "C1", cursor: "page-1", accessToken: "stored-token" } } }) });
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.result.output.items[0].id).toBe("slack:C1:123");
    expect(body.result.output.cursor).toBe("page-2");
    expect(calls).toHaveLength(1);
  } finally { globalThis.fetch = nativeFetch; await server.stop(true); }
});

async function rpcFixture(connector: string, input: Record<string, unknown>, provider: (url: URL, init: RequestInit) => Response | Promise<Response>) {
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any, init: any) => provider(new URL(String(url)), init)) as typeof fetch;
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: createFetchHandler() });
  try {
    const response = await nativeFetch(`http://127.0.0.1:${server.port}/rpc`, { method: "POST", body: JSON.stringify({ id: "fixture", method: "connector.sync.list", params: { connectorKey: connector, sync: "messages.list", input } }) });
    return await response.json();
  } finally { globalThis.fetch = nativeFetch; await server.stop(true); }
}

test("Gmail hydrates list IDs before normalizing a durable message", async () => {
  let calls = 0;
  const result = await rpcFixture("google-workspace", { accessToken: "stored", query: "is:unread", cursor: "page1", limit: 2 }, (url, init) => {
    calls++;
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer stored");
    if (calls === 1) {
      expect(url.searchParams.get("q")).toBe("is:unread");
      expect(url.searchParams.get("pageToken")).toBe("page1");
      return Response.json({ messages: [{ id: "m1", threadId: "t1" }], nextPageToken: "page2" });
    }
    expect(url.pathname).toBe("/gmail/v1/users/me/messages/m1");
    expect(url.searchParams.get("format")).toBe("full");
    return Response.json({ id: "m1", threadId: "t1", snippet: "hello", payload: { headers: [{ name: "From", value: "sender@example.com" }] } });
  });
  expect(result.ok).toBe(true);
  expect(result.result.output.items[0]).toMatchObject({ channelId: "t1", senderId: "sender@example.com", providerMessageId: "m1" });
  expect(result.result.output.cursor).toBe("page2");
  expect(calls).toBe(2);
});

test("Microsoft preserves provider next-link paging and normalized conversation", async () => {
  const cursor = "https://graph.microsoft.com/v1.0/me/messages?$skip=2";
  const result = await rpcFixture("microsoft-365", { accessToken: "stored", cursor }, url => {
    expect(url.toString()).toBe(cursor);
    return Response.json({ value: [{ id: "m1", conversationId: "thread", from: { emailAddress: { address: "sender@example.com" } }, bodyPreview: "hello" }], "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/messages?$skip=4" });
  });
  expect(result.ok).toBe(true);
  expect(result.result.output.items[0].channelId).toBe("thread");
  expect(result.result.output.cursor).toContain("$skip=4");
  let calls = 0;
  const refused = await rpcFixture("microsoft-365", { accessToken: "stored", cursor: "https://attacker.example/messages" }, () => { calls++; return Response.json({ value: [] }); });
  expect(refused.error.code).toBe("INVALID_SYNC_INPUT");
  expect(calls).toBe(0);
});

test("Telegram polling advances past all updates and retains channel-post identity", async () => {
  const result = await rpcFixture("telegram", { botToken: "stored-token", cursor: "50" }, url => {
    expect(url.pathname).toBe("/botstored-token/getUpdates");
    expect(url.searchParams.get("offset")).toBe("50");
    return Response.json({ ok: true, result: [{ update_id: 50, channel_post: { message_id: 7, chat: { id: -100 }, sender_chat: { id: -100 }, text: "news" } }, { update_id: 51, callback_query: { id: "ignored" } }] });
  });
  expect(result.ok).toBe(true);
  expect(result.result.output.items[0].senderId).toBe("-100");
  expect(result.result.output.cursor).toBe("52");
});

test("malformed pages and provider errors never become empty successes", async () => {
  for (const connector of ["slack", "telegram", "google-workspace", "microsoft-365"]) {
    const input = { accessToken: "stored", botToken: "stored", channelId: "C1" };
    const malformed = await rpcFixture(connector, input, () => Response.json({}));
    expect(malformed.ok).toBe(false);
    const limited = await rpcFixture(connector, input, () => Response.json({}, { status: 429, headers: { "retry-after": "120" } }));
    expect(limited.error).toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 120 });
  }
});
