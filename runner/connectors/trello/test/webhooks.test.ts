import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const WEBHOOK_OPS = [
  "webhook.card_created",
  "webhook.card_updated",
  "webhook.card_deleted",
  "webhook.card_comment",
  "webhook.list_created",
  "webhook.board_updated",
  "webhook.member_added",
  "webhook.checklist_updated",
] as const;

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const { actions } = compileDeclarativeConnector(manifest as never);

describe("trello webhook operations", () => {
  it("declares each trigger as kind webhook with EventOnly catalog limits and no handler", () => {
    for (const key of WEBHOOK_OPS) {
      const operation = operations[key];
      expect(operation, key).toBeDefined();
      expect(operation.kind).toBe("webhook");
      expect(operation.timeoutMs).toBe(30000);
      expect(operation.maxInputBytes).toBe(1048576);
      expect(operation.maxResponseBytes).toBe(1048576);
      expect(operation.request, `${key} must not declare a request block`).toBeUndefined();
      expect(actions[key], `${key} must not compile to an HTTP handler`).toBeUndefined();
    }
  });

  it("does not invent extra webhook keys in this depth slice", () => {
    expect(
      Object.keys(operations)
        .filter((key) => key.startsWith("webhook."))
        .sort(),
    ).toEqual([...WEBHOOK_OPS].sort());
  });
});
