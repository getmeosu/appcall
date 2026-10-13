import { describe, expect, test } from "bun:test";
import slackManifest from "../manifest.json";
import expandedCases from "../fixtures/expanded_api_methods.json";
import { buildSlackExpandedManifestOperations, slackExpandedActionHandlers } from "../src/expanded_actions";

type Case = {
  method: string;
  input: Record<string, unknown>;
  required: string[];
  requiredAny?: string[];
  requiredGroups?: string[][];
  body: Record<string, unknown>;
  response: Record<string, unknown>;
};

const cases = expandedCases as Record<string, Case>;
const manifest = slackManifest as {
  auth: { scopes: string[] };
  operations: Record<string, Record<string, any>>;
};

describe("Slack Web API parity actions", () => {
  test("omits deprecated users.setActive from the manifest, handlers, and fixtures", () => {
    expect(Object.hasOwn(manifest.operations, "users.setActive")).toBe(false);
    expect(Object.hasOwn(slackExpandedActionHandlers, "users.setActive")).toBe(false);
    expect(Object.hasOwn(cases, "users.setActive")).toBe(false);
  });

  test("declares the depth methods that were previously omitted for token-scope reasons", () => {
    const declared = [
      "search.messages",
      "search.all",
      "search.files",
      "users.profile.set",
      "users.deletePhoto",
      "users.identity",
      "dnd.setSnooze",
      "dnd.endDnd",
      "dnd.endSnooze",
      "stars.add",
      "stars.remove",
      "stars.list",
      "files.sharedPublicURL",
    ];
    for (const operation of declared) {
      expect(Object.hasOwn(manifest.operations, operation)).toBe(true);
      // Declarative depth operations do not shadow a registered handler.
      expect(Object.hasOwn(slackExpandedActionHandlers, operation)).toBe(false);
      expect(Object.hasOwn(cases, operation)).toBe(false);
    }
  });

  test("keeps the multipart-only users.setPhoto out of the manifest", () => {
    expect(Object.hasOwn(manifest.operations, "users.setPhoto")).toBe(false);
    expect(Object.hasOwn(slackExpandedActionHandlers, "users.setPhoto")).toBe(false);
    expect(Object.hasOwn(cases, "users.setPhoto")).toBe(false);
  });

  test("keeps user-only OAuth scopes out of the bot authorization scope list", () => {
    // The managed OAuth flow authorizes with bot scopes (scope=); the user-only
    // scopes required by some depth methods are not requested here.
    expect(manifest.auth.scopes).not.toContain("search:read");
    expect(manifest.auth.scopes).not.toContain("users.profile:write");
    expect(manifest.auth.scopes).not.toContain("dnd:write");
    expect(manifest.auth.scopes).not.toContain("stars:read");
    expect(manifest.auth.scopes).not.toContain("stars:write");
  });

  test("declares recurrence as an object and omits unsupported remote-file content fields", () => {
    expect(manifest.operations["reminders.add"].inputSchema.properties.recurrence.type).toBe("object");
    const recurrence = manifest.operations["reminders.add"].inputSchema.properties.recurrence;
    const weeklyRule = recurrence.anyOf.find((rule: Record<string, any>) => rule.properties?.frequency?.enum?.includes("weekly"));
    expect(weeklyRule?.required ?? []).not.toContain("weekdays");
    for (const operation of ["files.remote.add", "files.remote.update"]) {
      expect(Object.hasOwn(manifest.operations[operation].inputSchema.properties, "indexableFileContents")).toBe(false);
    }
  });

  test("registers a real handler and object input schema for every added operation", () => {
    expect(Object.keys(slackExpandedActionHandlers).sort()).toEqual(Object.keys(cases).sort());
    const generated = buildSlackExpandedManifestOperations();

    for (const operation of Object.keys(cases)) {
      const definition = manifest.operations[operation];
      expect(definition?.kind).toBe("action");
      expect(typeof definition?.title).toBe("string");
      expect(typeof definition?.description).toBe("string");
      expect(definition?.inputSchema?.type).toBe("object");
      expect(definition).toEqual(generated[operation]);
      expect(typeof slackExpandedActionHandlers[operation as keyof typeof slackExpandedActionHandlers]).toBe("function");
    }
  });

  for (const [operation, fixture] of Object.entries(cases)) {
    test(`${operation} sends the expected Slack method request`, async () => {
      const requests: Request[] = [];
      const handler = slackExpandedActionHandlers[operation as keyof typeof slackExpandedActionHandlers];
      const result = await handler({
        ...fixture.input,
        token: "xoxp-test-token",
        fetch: async (input, init) => {
          requests.push(new Request(input, init));
          return Response.json(fixture.response);
        },
      });

      expect(requests).toHaveLength(1);
      expect(requests[0].url).toBe(`https://slack.com/api/${fixture.method}`);
      expect(requests[0].method).toBe("POST");
      expect(requests[0].redirect).toBe("error");
      expect(requests[0].headers.get("Authorization")).toBe("Bearer xoxp-test-token");
      expect(requests[0].headers.get("Content-Type")).toContain("application/json");
      expect(await requests[0].json()).toEqual(fixture.body);
      expect(result).toEqual({ connector: "slack", action: operation, source: "connector", data: fixture.response });
    });
  }

  test("rejects missing required parameters before making a request", async () => {
    for (const [operation, fixture] of Object.entries(cases)) {
      const input = { ...fixture.input };
      const field = fixture.required[0];
      if (field) delete input[field];
      else if (fixture.requiredAny?.length) for (const anyField of fixture.requiredAny) delete input[anyField];
      else input.unexpected = "reject this field";

      let fetchCalls = 0;
      const handler = slackExpandedActionHandlers[operation as keyof typeof slackExpandedActionHandlers];
      await expect(handler({
        ...input,
        token: "xoxp-test-token",
        fetch: async () => {
          fetchCalls += 1;
          return Response.json({ ok: true });
        },
      })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
      expect(fetchCalls).toBe(0);
    }
  });

  test("rejects unknown parameters instead of forwarding them to Slack", async () => {
    let fetchCalls = 0;
    await expect(slackExpandedActionHandlers["reminders.list"]({
      unexpected: "must not be forwarded",
      token: "xoxp-test-token",
      fetch: async () => {
        fetchCalls += 1;
        return Response.json({ ok: true });
      },
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(fetchCalls).toBe(0);
  });

  test("rejects unsafe URLs, invalid nested profile fields, and incomplete one-of inputs", async () => {
    const invalidInputs: Array<[string, Record<string, unknown>]> = [
      ["files.remote.add", { externalId: "doc-123", externalUrl: "http://docs.example.com/runbook", title: "Runbook" }],
      ["files.remote.add", { externalId: "doc-123", externalUrl: "https://user:pass@docs.example.com/runbook", title: "Runbook" }],
      ["files.remote.add", { externalId: "doc-123", externalUrl: "https://docs.example.com/runbook", title: "Runbook", indexableFileContents: "runbook" }],
      ["files.remote.update", { externalId: "doc-123", title: "Runbook", indexableFileContents: "runbook" }],
      ["files.remote.update", { externalId: "doc-123" }],
      ["conversations.open", { users: "U123", channel: "D123" }],
      ["reminders.add", { text: "Review PR", time: "tomorrow", recurrence: "weekly" }],
      ["reminders.add", { text: "Review PR", time: "tomorrow", recurrence: { frequency: "weekly", weekdays: ["funday"] } }],
      ["reminders.add", { text: "Review PR", time: "tomorrow", recurrence: { frequency: "daily", weekdays: ["monday"] } }],
      ["reminders.add", { text: "Review PR", time: "tomorrow", recurrence: { frequency: "weekly", weekdays: [], unexpected: true } }],
      ["calls.add", { externalUniqueId: "call-123", joinUrl: "http://calls.example.com/join/123", createdBy: "U123" }],
      ["chat.unfurl", { channel: "C123", ts: "1715680861.000200" }],
      ["slackLists.access.set", { listId: "Flist123", accessLevel: "read", channelIds: ["C123"], userIds: ["U123"] }],
      ["users.conversations", { types: ["public_channel", "dm"] }],
      ["canvases.access.set", { canvasId: "Fcanvas123", accessLevel: "read", channelIds: ["C123"], userIds: ["U123"] }],
      ["chat.startStream", { channel: "C123", markdownText: "hi", chunks: [{ type: "markdown_text", text: "hi" }] }],
      ["chat.appendStream", { channel: "C123", ts: "1715680861.000200" }],
      ["blocks.validate", { blocks: [{ type: "section" }], view: { type: "modal" } }],
      ["views.open", { view: { type: "modal" }, triggerId: "123.456.abc", interactivityPointer: "123.456.abc" }],
      ["conversations.inviteShared", { channel: "C123", emails: ["a@example.com"], userIds: ["U123"] }],
      ["files.getUploadURLExternal", { filename: "notes.txt", length: 0 }],
      ["agents.conversations.removeView", { channelId: "C9876543210", viewKey: "plan", viewId: "T123" }],
      ["agents.conversations.setProperties", { channelId: "C9876543210" }],
      ["apps.auth.external.delete", {}],
      ["workflows.triggers.permissions.add", { triggerId: "Ft0000000001" }],
    ];
    let fetchCalls = 0;
    for (const [operation, input] of invalidInputs) {
      await expect(slackExpandedActionHandlers[operation]({
        ...input,
        token: "xoxp-test-token",
        fetch: async () => {
          fetchCalls += 1;
          return Response.json({ ok: true });
        },
      })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    }
    expect(fetchCalls).toBe(0);
  });

  test("allows a weekly reminder recurrence without explicit weekdays", async () => {
    const requests: Request[] = [];
    await slackExpandedActionHandlers["reminders.add"]({
      text: "Review PR",
      time: "tomorrow",
      recurrence: { frequency: "weekly" },
      token: "xoxp-test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({ ok: true });
      },
    });

    expect(requests).toHaveLength(1);
    expect(await requests[0].json()).toEqual({
      text: "Review PR",
      time: "tomorrow",
      recurrence: { frequency: "weekly" },
    });
  });

  test("returns a typed rate-limit error without exposing the token", async () => {
    await expect(slackExpandedActionHandlers["reminders.list"]({
      token: "xoxp-private-token",
      fetch: async () => new Response(JSON.stringify({ ok: false, error: "ratelimited" }), {
        status: 429,
        headers: { "Retry-After": "12" },
      }),
    })).rejects.toEqual({
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      message: "The upstream provider rate limited this request.",
      retryAfterSeconds: 12,
    });
  });

  test("maps provider error codes and rejects oversized or invalid JSON responses", async () => {
    await expect(slackExpandedActionHandlers["conversations.open"]({
      users: "U123",
      token: "xoxp-test-token",
      fetch: async () => Response.json({ ok: false, error: "channel_not_found" }),
    })).rejects.toEqual({
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: "Slack rejected the conversations.open request.",
      providerError: "channel_not_found",
    });

    await expect(slackExpandedActionHandlers["reminders.list"]({
      token: "xoxp-test-token",
      fetch: async () => new Response("not-json"),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    await expect(slackExpandedActionHandlers["reminders.list"]({
      token: "xoxp-test-token",
      fetch: async () => new Response("x".repeat(1024 * 1024 + 1)),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
