import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { createConnectorRegistry, defaultConnectorRegistry } from "../../../bun/src/registry";
import { compileStrictValidator } from "../../../bun/src/declarative/strict-schema";
import {
  executeConversationsReplySync,
  executeConversationsCloseSync,
  executeConversationsAssignSync,
  executeConversationsTagSync,
} from "../src/sync";
import conversationReplyPrimaryFixture from "../fixtures/conversation_reply_primary.json";
import conversationClosePostFixture from "../fixtures/conversation_close_post.json";
import conversationAssignPostFixture from "../fixtures/conversation_assign_post.json";
import tagAttachedFixture from "../fixtures/tag_attached.json";

// FX-intercom-2: conversations.reply/close/assign/tag declare the closed
// outputSchema {data: object}. Their primary handlers must return exactly that
// shape. Intercom API 2.13: reply and parts (close/assign) return the
// Conversation; POST /conversations/{id}/tags returns the Tag that was added.

type Op = { outputSchema: Record<string, unknown>; effectPolicy?: string; reconcile?: string };
const ops = manifest.operations as unknown as Record<string, Op>;

const CASES: [string, Record<string, unknown>, unknown, string][] = [
  ["conversations.reply", { id: "147", type: "admin", messageType: "comment", adminId: "991", body: "Thanks" }, conversationReplyPrimaryFixture, "POST /conversations/147/reply"],
  ["conversations.close", { id: "147", adminId: "991", body: "Closing - resolved." }, conversationClosePostFixture, "POST /conversations/147/parts"],
  ["conversations.assign", { id: "147", adminId: "991", assigneeId: "5", body: "Over to you." }, conversationAssignPostFixture, "POST /conversations/147/parts"],
  ["conversations.tag", { id: "147", tagId: "7522907", adminId: "991" }, tagAttachedFixture, "POST /conversations/147/tags"],
];

function fixtureFetch(body: unknown) {
  const calls: string[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    calls.push(`${init?.method ?? "GET"} ${url.pathname}`);
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

// The primary path as the registry dispatches it: the same manifest with the
// effect keys set aside, so the registry returns the handler's own output
// (the default registry still reconciles these ops until FX-intercom-1 lands).
const primaryManifest = JSON.parse(JSON.stringify(manifest)) as { operations: Record<string, Record<string, unknown>> };
for (const [id] of CASES) {
  delete primaryManifest.operations[id]!.effectPolicy;
  delete primaryManifest.operations[id]!.reconcile;
}
const primaryRegistry = createConnectorRegistry({
  manifests: [primaryManifest as never],
  healthchecks: {},
  actions: {
    intercom: {
      "conversations.reply": executeConversationsReplySync as never,
      "conversations.close": executeConversationsCloseSync as never,
      "conversations.assign": executeConversationsAssignSync as never,
      "conversations.tag": executeConversationsTagSync as never,
    },
  },
});

describe("FX-intercom-2: write handlers return their declared {data} outputSchema", () => {
  test("the 4 declared outputSchemas are unchanged and closed", () => {
    for (const [id] of CASES) {
      expect(ops[id]!.outputSchema, id).toEqual({
        type: "object",
        required: ["data"],
        properties: { data: { type: "object" } },
        additionalProperties: false,
      });
    }
  });

  for (const [id, input, fixture, request] of CASES) {
    test(`${id}: registry output validates against its outputSchema (strict validator)`, async () => {
      const { calls, impl } = fixtureFetch(fixture);
      const result = primaryRegistry.executeAction("intercom", id, { ...input, accessToken: "token", fetch: impl });
      expect(result.ok).toBe(true);
      const output = await Promise.resolve((result as { output: unknown }).output);
      expect(calls).toEqual([request]);
      expect(output).toEqual({ data: fixture });
      const validate = compileStrictValidator(ops[id]!.outputSchema as never, { registry: true });
      expect(() => validate(output)).not.toThrow();
    });
  }

  test("the strict validator rejects the old primary shapes", () => {
    const validate = compileStrictValidator(ops["conversations.close"]!.outputSchema as never, { registry: true });
    expect(() => validate({ conversation: null })).toThrow();
    expect(() => validate(conversationReplyPrimaryFixture)).toThrow();
  });

  test("conversations.reply via the default registry: create-like, no effect keys, one POST and no observe", async () => {
    const { calls, impl } = fixtureFetch(conversationReplyPrimaryFixture);
    const result = defaultConnectorRegistry.executeAction("intercom", "conversations.reply", {
      id: "147", type: "admin", messageType: "comment", adminId: "991", body: "Thanks", accessToken: "token", fetch: impl,
    });
    expect(result.ok).toBe(true);
    await Promise.resolve((result as { output: unknown }).output);
    expect(calls).toEqual(["POST /conversations/147/reply"]);
  });

  test("a non-object upstream body fails closed", async () => {
    const { impl } = fixtureFetch([]);
    await expect(
      executeConversationsCloseSync({ id: "147", adminId: "991", accessToken: "token", fetch: impl }),
    ).rejects.toThrow(/not a JSON object/);
  });
});
