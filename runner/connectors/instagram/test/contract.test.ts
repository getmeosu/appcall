import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import coverage from "../../instagram.coverage.json";

type Operation = {
  kind?: string;
  sideEffect?: string;
  timeoutMs?: number;
  maxInputBytes?: number;
  maxResponseBytes?: number;
  title?: string;
  description?: string;
  validationMode?: string;
  enforceOutputSchema?: boolean;
  responseFormat?: string;
  inputSchema?: { type?: string; additionalProperties?: boolean };
  outputSchema?: { type?: string };
  request?: { method?: string; path?: string; success?: number[] };
};

const operations = manifest.operations as Record<string, Operation>;
const { actions } = compileDeclarativeConnector(manifest);

// The 21 INSTAGRAM_* slugs implemented from the L2 missing_http backlog.
const l2Routes: Record<string, [string, string]> = {
  "containers.create": ["POST", "/{{instagramUserId}}/media"],
  "containers.createCarousel": ["POST", "/{{instagramUserId}}/media"],
  "media.children.list": ["GET", "/{{mediaId}}/children"],
  "media.setCommentEnabled": ["POST", "/{{mediaId}}"],
  "comments.replies.list": ["GET", "/{{commentId}}/replies"],
  "comments.replies.create": ["POST", "/{{commentId}}/replies"],
  "conversations.get": ["GET", "/{{conversationId}}"],
  "conversations.list": ["GET", "/{{instagramUserId}}/conversations"],
  "conversations.listByPage": ["GET", "/{{pageId}}/conversations"],
  "messages.list": ["GET", "/{{conversationId}}/messages"],
  "messages.sendText": ["POST", "/{{instagramUserId}}/messages"],
  "messages.sendImage": ["POST", "/{{instagramUserId}}/messages"],
  "messages.markSeen": ["POST", "/{{instagramUserId}}/messages"],
  "mentions.reply": ["POST", "/{{instagramUserId}}/mentions"],
  "liveMedia.list": ["GET", "/{{instagramUserId}}/live_media"],
  "nodes.getMultiple": ["GET", "/"],
  "messengerProfile.get": ["GET", "/{{instagramUserId}}/messenger_profile"],
  "messengerProfile.update": ["POST", "/{{instagramUserId}}/messenger_profile"],
  "messengerProfile.delete": ["DELETE", "/{{instagramUserId}}/messenger_profile"],
  "subscribedApps.list": ["GET", "/{{instagramUserId}}/subscribed_apps"],
  "subscribedApps.subscribe": ["POST", "/{{instagramUserId}}/subscribed_apps"],
};

describe("instagram L2 coverage contract", () => {
  it("certifies the 40-tool inventory with no missing_http rows", () => {
    expect(coverage.key).toBe("instagram");
    expect(coverage.slug).toBe("INSTAGRAM");
    expect(coverage.composio_tools).toBe(40);
    expect(coverage.full_depth).toBe(true);
    expect(coverage.missing_http).toEqual([]);
    expect(coverage.mapped).toHaveLength(38);
    expect(coverage.missing_still).toHaveLength(2);
    expect(coverage.mapped.length + coverage.missing_http.length + coverage.missing_still.length)
      .toBe(coverage.composio_tools);
    const still = Object.fromEntries(coverage.missing_still.map((row) => [row.tool, row.why]));
    expect(still.INSTAGRAM_CREATE_MEDIA_CONTAINER).toContain("reason=deprecated_product");
    expect(still.INSTAGRAM_REPLY_TO_COMMENT).toContain("reason=deprecated_product");
  });

  it("maps every certified tool to a compiled declarative action", () => {
    for (const row of coverage.mapped) {
      expect(actions[row.operation], row.tool).toBeDefined();
      const operation = operations[row.operation];
      expect(operation, row.tool).toBeDefined();
      expect(operation.kind, row.tool).toBe("action");
      expect(operation.request?.method, row.tool).toBeTruthy();
      expect(operation.request?.path, row.tool).toBeTruthy();
      expect(operation.inputSchema?.type, row.tool).toBe("object");
      expect(operation.outputSchema?.type, row.tool).toBe("object");
    }
  });

  it("declares the documented route and strict flags for each L2 backlog operation", () => {
    expect(Object.keys(l2Routes)).toHaveLength(21);
    for (const [key, [method, path]] of Object.entries(l2Routes)) {
      const operation = operations[key];
      expect(operation, key).toBeDefined();
      expect(operation.kind, key).toBe("action");
      expect(operation.request?.method, key).toBe(method);
      expect(operation.request?.path, key).toBe(path);
      expect(operation.request?.success, key).toEqual([200]);
      expect(operation.sideEffect, key).toBe(method === "GET" ? "read" : method === "DELETE" ? "destructive" : "write");
      expect(operation.validationMode, key).toBe("strict-generated");
      expect(operation.enforceOutputSchema, key).toBe(true);
      expect(operation.responseFormat, key).toBe("json");
      expect(operation.inputSchema?.additionalProperties, key).toBe(false);
      expect(operation.timeoutMs, key).toBe(15000);
      expect(operation.maxInputBytes, key).toBe(65536);
      expect(operation.maxResponseBytes, key).toBe(5242880);
      expect(operation.title?.length, key).toBeGreaterThan(0);
      expect(operation.description?.length, key).toBeGreaterThan(0);
    }
  });
});
