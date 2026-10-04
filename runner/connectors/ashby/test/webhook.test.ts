import { describe, expect, test } from "bun:test";
import { parseWebhook } from "../src/webhook";

describe("parseWebhook", () => {
  test("classifies applicationSubmit as webhook.application_submitted", () => {
    const result = parseWebhook({
      webhookActionId: "wh-1",
      action: "applicationSubmit",
      data: { id: "app-1", candidate: { id: "cand-1" } },
    });
    expect(result.operation).toBe("webhook.application_submitted");
    expect(result.sanitized).toEqual({
      action: "applicationSubmit",
      applicationId: "app-1",
      candidateId: "cand-1",
    });
    expect(result.idempotencyKey).toBe("ashby-wh:wh-1");
  });

  test("classifies candidateUpdate as webhook.candidate_updated", () => {
    const result = parseWebhook({
      webhookActionId: "wh-2",
      action: "candidateUpdate",
      data: { id: "cand-9", name: "Ada" },
    });
    expect(result.operation).toBe("webhook.candidate_updated");
    expect(result.sanitized).toEqual({
      action: "candidateUpdate",
      candidateId: "cand-9",
    });
    expect(result.idempotencyKey).toBe("ashby-wh:wh-2");
  });

  test("classifies interviewScheduleCreate as webhook.interview_scheduled", () => {
    const result = parseWebhook({
      action: "interviewScheduleCreate",
      data: { id: "sched-1", applicationId: "app-1" },
    });
    expect(result.operation).toBe("webhook.interview_scheduled");
    expect(result.sanitized).toEqual({
      action: "interviewScheduleCreate",
      interviewScheduleId: "sched-1",
      applicationId: "app-1",
    });
    expect(result.idempotencyKey).toBe("ashby-wh:sched-1");
  });

  test("classifies offerCreate as webhook.offer_created", () => {
    const result = parseWebhook({
      webhookActionId: "wh-4",
      action: "offerCreate",
      data: { id: "off-1", applicationId: "app-1" },
    });
    expect(result.operation).toBe("webhook.offer_created");
    expect(result.sanitized).toEqual({
      action: "offerCreate",
      offerId: "off-1",
      applicationId: "app-1",
    });
    expect(result.idempotencyKey).toBe("ashby-wh:wh-4");
  });

  test("redelivery of the same webhookActionId collapses", () => {
    const payload = { webhookActionId: "wh-repeat", action: "applicationSubmit", data: { id: "app-1" } };
    expect(parseWebhook(payload).idempotencyKey).toBe(parseWebhook(payload).idempotencyKey);
  });

  test("tolerates a non-object payload", () => {
    const result = parseWebhook("not-an-object");
    expect(result.operation).toBe("webhook.application_submitted");
    expect(result.idempotencyKey).toBe("ashby-wh:unknown");
    expect(result.sanitized).toEqual({});
  });

  test("unknown action still yields a webhook operation and blank ids", () => {
    const result = parseWebhook({ action: "jobUpdate", data: { id: "job-1" } });
    expect(result.operation).toBe("webhook.application_submitted");
    expect(result.sanitized).toEqual({ action: "jobUpdate" });
  });
});
