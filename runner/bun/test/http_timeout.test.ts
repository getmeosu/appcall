import { describe, expect, test } from "bun:test";
import { ConnectorHttpError, createConnectorHttpClient, defaultOutboundTimeoutMs } from "../src/http";

describe("outbound request deadline", () => {
  test("aborts a stalled request and reports OUTBOUND_TIMEOUT", async () => {
    let observedSignal: AbortSignal | undefined;
    const client = createConnectorHttpClient({
      allowedHosts: ["api.example.com"],
      maxResponseBytes: 65536,
      timeoutMs: 20,
      fetch: async (_input, init) => {
        observedSignal = (init as RequestInit).signal ?? undefined;
        // A provider that accepts the connection and never answers.
        return await new Promise<Response>((_resolve, reject) => {
          observedSignal?.addEventListener("abort", () => reject(observedSignal?.reason), { once: true });
        });
      },
    });

    await expect(client.fetchText("https://api.example.com/slow"))
      .rejects.toMatchObject({ code: "OUTBOUND_TIMEOUT" });
    // The request was actually cancelled, not merely abandoned: this is what
    // stops a "timed out" send from still being delivered.
    expect(observedSignal?.aborted).toBe(true);
  });

  test("passes a live signal to fetch and does not abort a fast request", async () => {
    let signalAtCall: boolean | undefined;
    const client = createConnectorHttpClient({
      allowedHosts: ["api.example.com"],
      maxResponseBytes: 65536,
      timeoutMs: 5_000,
      fetch: async (_input, init) => {
        signalAtCall = ((init as RequestInit).signal as AbortSignal | undefined)?.aborted;
        return new Response(`{"ok":true}`, { status: 200 });
      },
    });

    const response = await client.fetchText("https://api.example.com/fast");
    expect(response.status).toBe(200);
    expect(signalAtCall).toBe(false);
  });

  test("forwards a caller's abort", async () => {
    const caller = new AbortController();
    const client = createConnectorHttpClient({
      allowedHosts: ["api.example.com"],
      maxResponseBytes: 65536,
      timeoutMs: 5_000,
      fetch: async (_input, init) => {
        const signal = (init as RequestInit).signal as AbortSignal;
        return await new Promise<Response>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted by caller")), { once: true });
        });
      },
    });

    const pending = client.fetchText("https://api.example.com/slow", { signal: caller.signal });
    caller.abort();
    await expect(pending).rejects.toThrow("aborted by caller");
  });

  test("falls back to the default deadline when none is given", () => {
    expect(defaultOutboundTimeoutMs).toBe(300_000);
    const client = createConnectorHttpClient({
      allowedHosts: ["api.example.com"],
      maxResponseBytes: 65536,
    });
    expect(typeof client.fetchText).toBe("function");
  });

  test("still blocks a disallowed host before any request is made", async () => {
    let called = false;
    const client = createConnectorHttpClient({
      allowedHosts: ["api.example.com"],
      maxResponseBytes: 65536,
      timeoutMs: 20,
      fetch: async () => {
        called = true;
        return new Response("{}", { status: 200 });
      },
    });

    await expect(client.fetchText("https://evil.example.net/x"))
      .rejects.toBeInstanceOf(ConnectorHttpError);
    expect(called).toBe(false);
  });
});
