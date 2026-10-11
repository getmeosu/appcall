import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";

const WEBHOOK_OPS = [
  "webhook.meeting_started",
  "webhook.meeting_ended",
  "webhook.recording_completed",
  "webhook.daily_usage_report_changed",
  "webhook.meeting_details_changed",
  "webhook.meeting_recording_changed",
  "webhook.meeting_summary_updated",
  "webhook.new_cloud_recording",
  "webhook.new_meeting_created",
  "webhook.new_meeting_participant",
  "webhook.new_webinar_created",
  "webhook.new_webinar_participant",
  "webhook.user_information_changed",
  "webhook.webinar_details_changed",
] as const;

describe("zoom webhook operations", () => {
  test("declares each trigger as kind webhook with sideEffect read", () => {
    const ops = manifest.operations as Record<string, { kind: string; inputSchema?: unknown; request?: unknown; sideEffect?: string }>;
    for (const key of WEBHOOK_OPS) {
      expect(ops[key]).toBeDefined();
      expect(ops[key].kind).toBe("webhook");
      expect(ops[key].inputSchema).toBeUndefined();
      expect(ops[key].request).toBeUndefined();
      expect(ops[key].sideEffect).toBe("read");
    }
  });
});
