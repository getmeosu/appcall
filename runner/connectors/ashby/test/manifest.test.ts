import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

describe("Ashby manifest", () => {
  it("has correct key", () => {
    expect(manifest.key).toBe("ashby");
  });

  it("has version 0.6.1", () => {
    expect(manifest.version).toBe("0.6.1");
  });

  it("uses bun runtime", () => {
    expect(manifest.runtime).toBe("bun");
  });

  it("declares api_key auth with setup fields", () => {
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.auth.setup.mode).toBe("api_key");
    expect(manifest.auth.setup.fields.some((field: { key: string }) => field.key === "apiKey")).toBe(true);
  });

  it("allows expected hosts", () => {
    expect(manifest.network.allowedHosts).toEqual(["api.ashbyhq.com"]);
  });

  it("uses Basic api_key auth", () => {
    expect(manifest.http.auth.basic).toEqual({ username: "{{apiKey}}", password: "" });
  });

  it("declares authenticated healthcheck request", () => {
    expect(manifest.operations.healthcheck.request).toBeTruthy();
    expect(manifest.operations.healthcheck.kind).toBe("action");
  });

  it("declares P0+P1 reads plus write ops", () => {
    expect(Object.keys(manifest.operations).sort()).toEqual([
      "applications.create",
      "applications.get",
      "applications.hire",
      "applications.list",
      "applications.move",
      "applications.reject",
      "archive_reasons.list",
      "candidates.create",
      "candidates.get",
      "candidates.list",
      "candidates.search",
      "candidates.update",
      "departments.list",
      "healthcheck",
      "interview_schedules.list",
      "interview_stages.list",
      "interviews.cancel",
      "interviews.list",
      "interviews.schedule",
      "jobs.get",
      "jobs.list",
      "offers.get",
      "offers.list",
      "openings.list",
      "sources.list",
      "users.list",
      "webhook.application_submitted",
      "webhook.candidate_updated",
      "webhook.interview_scheduled",
      "webhook.offer_created",
    ]);
    expect(manifest.operations["jobs.list"].kind).toBe("sync");
    expect(manifest.operations["candidates.list"].kind).toBe("sync");
    expect(manifest.operations["applications.list"].kind).toBe("sync");
    expect(manifest.operations["candidates.get"].kind).toBe("sync");
    expect(manifest.operations["applications.get"].kind).toBe("sync");
    expect(manifest.operations["candidates.search"].kind).toBe("sync");
    expect(manifest.operations["interviews.list"].kind).toBe("sync");
  });

  it("wires applications.move|reject|hire EffectPolicy Reconcile to applications.get", () => {
    for (const key of ["applications.move", "applications.reject", "applications.hire"] as const) {
      const op = manifest.operations[key] as {
        kind: string;
        sideEffect: string;
        effectPolicy: string;
        reconcile: string;
      };
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("write");
      expect(op.effectPolicy).toBe("Reconcile");
      expect(op.reconcile).toBe("applications.get");
    }
  });

  it("wires candidates.create EffectPolicy Idempotent to candidates.get", () => {
    const create = manifest.operations["candidates.create"] as {
      kind: string;
      sideEffect: string;
      effectPolicy: string;
      reconcile: string;
    };
    expect(create.kind).toBe("action");
    expect(create.sideEffect).toBe("write");
    expect(create.effectPolicy).toBe("Idempotent");
    expect(create.reconcile).toBe("candidates.get");
  });

  it("wires applications.create EffectPolicy Idempotent to applications.get", () => {
    const create = manifest.operations["applications.create"] as {
      kind: string;
      sideEffect: string;
      effectPolicy: string;
      reconcile: string;
    };
    expect(create.kind).toBe("action");
    expect(create.sideEffect).toBe("write");
    expect(create.effectPolicy).toBe("Idempotent");
    expect(create.reconcile).toBe("applications.get");
  });

  it("declares interviews.schedule|cancel as write actions", () => {
    for (const key of ["interviews.schedule", "interviews.cancel"] as const) {
      const op = manifest.operations[key] as { kind: string; sideEffect: string };
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("write");
    }
  });

  it("declares job, candidate, application, interview, interview_schedule models", () => {
    expect(manifest.models).toEqual([
      "job",
      "candidate",
      "application",
      "interview",
      "interview_schedule",
      "offer",
      "department",
      "user",
      "source",
      "archive_reason",
      "interview_stage",
      "opening",
    ]);
  });

  it("wires candidates.update EffectPolicy Reconcile to candidates.get", () => {
    const update = manifest.operations["candidates.update"] as {
      kind: string;
      sideEffect: string;
      effectPolicy: string;
      reconcile: string;
    };
    expect(update.kind).toBe("action");
    expect(update.sideEffect).toBe("write");
    expect(update.effectPolicy).toBe("Reconcile");
    expect(update.reconcile).toBe("candidates.get");
  });

  it("declares 30 operations and no interview_schedules.get (Ashby-0 cite-drop)", () => {
    expect(Object.keys(manifest.operations)).toHaveLength(30);
    expect(Object.prototype.hasOwnProperty.call(manifest.operations, "interview_schedules.get")).toBe(false);
    expect(JSON.stringify(manifest)).not.toContain("interviewSchedule.info");
  });

  it("documents candidates.update id -> candidateId and required interviewPlanId", () => {
    expect(manifest.operations["candidates.update"].description).toContain("candidateId");
    expect(manifest.operations["candidates.update"].inputSchema.required).toEqual(["id"]);
    expect(manifest.operations["interview_stages.list"].description).toContain("Requires interviewPlanId");
  });

  it("declares EventOnly Ashby webhooks", () => {
    for (const key of [
      "webhook.application_submitted",
      "webhook.candidate_updated",
      "webhook.interview_scheduled",
      "webhook.offer_created",
    ] as const) {
      expect(manifest.operations[key].kind).toBe("webhook");
    }
  });
});
