import { afterEach, describe, expect, it } from "bun:test";
import { defaultConnectorRegistry } from "../../../bun/src/registry";
import { handleRPC } from "../../../bun/src/server";

// SEC-PATH-2b: empty / whitespace path ids are rejected before any request is
// built. P0: recordings.delete with recordingId "" used to send
// DELETE /v2/meetings/{id}/recordings, which deletes EVERY recording file.
type Call = { method: string; url: string };
function recorder() {
  const calls: Call[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ method: init?.method ?? "GET", url: String(input instanceof Request ? input.url : input) });
    return new Response(JSON.stringify({ id: 1, meetings: [], webinars: [], meetings_count: 0 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { calls, fetch };
}
async function run(operation: string, input: Record<string, unknown>): Promise<unknown> {
  const result = defaultConnectorRegistry.executeAction("zoom", operation, input) as { ok: boolean; output?: unknown; code?: string };
  if (result.ok === false) throw result;
  return await result.output;
}
const path = (call: Call) => new URL(call.url).pathname;
const BLANKS = ["", "  ", " ", "\t"];

describe("zoom recordings.delete never collapses to the meeting-wide route", () => {
  for (const bad of BLANKS) {
    it(`recordingId ${JSON.stringify(bad)}: rejected, no HTTP request`, async () => {
      const { calls, fetch } = recorder();
      await expect(run("recordings.delete", { accessToken: "t", meetingId: "85746065432", recordingId: bad, fetch })).rejects.toThrow(
        "recordingId",
      );
      expect(calls).toHaveLength(0);
    });
  }

  it("recording_id alias \"\" is rejected the same way", async () => {
    const { calls, fetch } = recorder();
    await expect(run("recordings.delete", { accessToken: "t", meetingId: "85746065432", recording_id: "", fetch })).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it("recordingId null is rejected (only an omitted value selects every file)", async () => {
    const { calls, fetch } = recorder();
    await expect(run("recordings.delete", { accessToken: "t", meetingId: "85746065432", recordingId: null, fetch })).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it("omitted recordingId keeps the documented delete-all route; a real id targets one file", async () => {
    const all = recorder();
    await run("recordings.delete", { accessToken: "t", meetingId: "85746065432", fetch: all.fetch });
    expect(all.calls.map((c) => `${c.method} ${path(c)}`)).toEqual(["DELETE /v2/meetings/85746065432/recordings"]);
    const one = recorder();
    await run("recordings.delete", { accessToken: "t", meetingId: "85746065432", recordingId: "rec-1", fetch: one.fetch });
    expect(one.calls.map((c) => `${c.method} ${path(c)}`)).toEqual(["DELETE /v2/meetings/85746065432/recordings/rec-1"]);
  });

  it("through the runner RPC the rejection is INVALID_ACTION_INPUT and nothing is sent", async () => {
    const original = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input instanceof Request ? input.url : input));
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    try {
      for (const bad of ["", "  "]) {
        const response = await handleRPC(
          new Request("http://runner/rpc", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              id: `sec-path-2b-${bad.length}`,
              method: "connector.action.execute",
              params: { connectorKey: "zoom", action: "recordings.delete", input: { accessToken: "t", meetingId: "85746065432", recordingId: bad } },
            }),
          }),
        );
        const body = (await response.json()) as { ok: boolean; error?: { code: string } };
        expect(body.ok).toBe(false);
        expect(body.error?.code).toBe("INVALID_ACTION_INPUT");
      }
      expect(calls).toHaveLength(0);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("zoom guards the RAW path value before encoding", () => {
  for (const [op, field] of [
    ["meetings.delete", "meetingId"],
    ["meetings.get", "meetingId"],
    ["webinars.get", "webinarId"],
    ["recordings.get", "meetingId"],
  ] as const) {
    for (const bad of [...BLANKS, "85746 065432", "8574\\6065432", "8574\u00006065432"]) {
      it(`${op}: ${field} ${JSON.stringify(bad)} rejected with zero fetches`, async () => {
        const { calls, fetch } = recorder();
        await expect(run(op, { accessToken: "t", [field]: bad, fetch })).rejects.toBeDefined();
        expect(calls).toHaveLength(0);
      });
    }
  }

  it("base64 meeting UUIDs with '/' keep Zoom's double encoding", async () => {
    const { calls, fetch } = recorder();
    await run("meetings.get", { accessToken: "t", meetingId: "/ajXp112QmuoKj4854875==", fetch });
    expect(path(calls[0]!)).toBe("/v2/meetings/%252FajXp112QmuoKj4854875%253D%253D");
  });
});

describe("zoom userId: only an omitted value defaults to \"me\"", () => {
  for (const [op, extra, route] of [
    ["meetings.list", {}, "/meetings"],
    ["meetings.create", { topic: "t" }, "/meetings"],
    ["webinars.list", {}, "/webinars"],
    ["webinars.create", { topic: "t" }, "/webinars"],
    ["recordings.list", { from: "2026-10-01" }, "/recordings"],
  ] as const) {
    for (const bad of BLANKS) {
      it(`${op}: userId ${JSON.stringify(bad)} is rejected, not mapped to me`, async () => {
        const { calls, fetch } = recorder();
        await expect(run(op, { accessToken: "t", ...extra, userId: bad, fetch })).rejects.toThrow("userId");
        expect(calls).toHaveLength(0);
      });
    }
    it(`${op}: omitted userId uses the documented "me" default`, async () => {
      const { calls, fetch } = recorder();
      await run(op, { accessToken: "t", ...extra, fetch }).catch(() => undefined);
      expect(path(calls[0]!)).toBe(`/v2/users/me${route}`);
    });
  }

  it("users.get: userId with whitespace or '/' is rejected", async () => {
    for (const bad of [...BLANKS, "a b@example.com", "a/b"]) {
      const { calls, fetch } = recorder();
      await expect(run("users.get", { accessToken: "t", userId: bad, fetch })).rejects.toBeDefined();
      expect(calls).toHaveLength(0);
    }
  });
});

describe("zoom IQ / ZRA user path fields (linus: 'iq user fields with \" \"')", () => {
  for (const op of ["iq.users.conversations.create", "iq.users.playlists.get", "zra.users.conversations.create", "zra.users.playlists.get"]) {
    for (const bad of BLANKS) {
      it(`${op}: userId ${JSON.stringify(bad)} rejected with zero fetches`, async () => {
        const { calls, fetch } = recorder();
        await expect(run(op, { accessToken: "t", userId: bad, topic: "x", fetch })).rejects.toBeDefined();
        expect(calls).toHaveLength(0);
      });
    }
  }

  it("iq.users.conversations.create: omitted userId keeps the declared 'me' default", async () => {
    const { calls, fetch } = recorder();
    await run("iq.users.conversations.create", { accessToken: "t", topic: "x", fetch }).catch(() => undefined);
    expect(path(calls[0]!)).toBe("/v2/iq/users/me/conversations");
  });

  it("iq.conversations.delete: conversationId ' ' is no longer sent as %20", async () => {
    const { calls, fetch } = recorder();
    await expect(run("iq.conversations.delete", { accessToken: "t", conversationId: " ", fetch })).rejects.toBeDefined();
    expect(calls).toHaveLength(0);
  });
});
