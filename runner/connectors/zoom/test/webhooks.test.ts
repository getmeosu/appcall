import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";

const WEBHOOK_OPS = [
  "webhook.meeting_started",
  "webhook.meeting_ended",
  "webhook.recording_completed",
] as const;

describe("zoom webhook operations", () => {
  test("declares each trigger as kind webhook without an action schema", () => {
    const ops = manifest.operations as Record<string, { kind: string; inputSchema?: unknown; request?: unknown }>;
    for (const key of WEBHOOK_OPS) {
      expect(ops[key]).toBeDefined();
      expect(ops[key].kind).toBe("webhook");
      expect(ops[key].inputSchema).toBeUndefined();
      expect(ops[key].request).toBeUndefined();
    }
  });
});
