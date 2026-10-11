import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

describe("Ashby manifest", () => {
  it("has correct key", () => {
    expect(manifest.key).toBe("ashby");
  });

  it("has version 0.9.1", () => {
    expect(manifest.version).toBe("0.9.1");
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

  it("declares tip+G1+G2+G3 operations", () => {
    expect(Object.keys(manifest.operations).sort()).toEqual([
      "application_feedback.list",
      "application_feedback.submit",
      "application_hiring_team_roles.list",
      "applications.change_source",
      "applications.create",
      "applications.get",
      "applications.hire",
      "applications.list",
      "applications.list_history",
      "applications.move",
      "applications.reject",
      "applications.transfer",
      "applications.update",
      "archive_reasons.list",
      "candidate_tags.create",
      "candidate_tags.list",
      "candidates.add_tag",
      "candidates.create",
      "candidates.create_note",
      "candidates.get",
      "candidates.list",
      "candidates.list_notes",
      "candidates.search",
      "candidates.update",
      "close_reasons.list",
      "communication_templates.list",
      "departments.get",
      "departments.list",
      "healthcheck",
      "hiring_team.add_member",
      "hiring_team.remove_member",
      "hiring_team_roles.list",
      "interview_schedules.list",
      "interview_stages.list",
      "interviews.cancel",
      "interviews.list",
      "interviews.schedule",
      "job_interview_plans.get",
      "job_postings.get",
      "job_postings.list",
      "job_postings.update",
      "job_templates.list",
      "jobs.create",
      "jobs.get",
      "jobs.list",
      "jobs.list_internal",
      "jobs.search",
      "jobs.set_status",
      "jobs.update",
      "locations.get",
      "locations.list",
      "offer_processes.start",
      "offers.create",
      "offers.get",
      "offers.list",
      "offers.start",
      "openings.add_job",
      "openings.add_location",
      "openings.create",
      "openings.get",
      "openings.list",
      "openings.remove_job",
      "openings.remove_location",
      "openings.search",
      "openings.set_archived",
      "openings.set_state",
      "openings.update",
      "sources.list",
      "users.get",
      "users.list",
      "users.search",
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

  it("omits all effect keys on tip candidates.create and applications.create (creates always omit)", () => {
    for (const key of ["candidates.create", "applications.create"] as const) {
      const create = manifest.operations[key] as Record<string, unknown>;
      expect(create.kind).toBe("action");
      expect(create.sideEffect).toBe("write");
      expect(create.effectPolicy).toBeUndefined();
      expect(create.reconcile).toBeUndefined();
      expect(create.observe).toBeUndefined();
    }
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

  it("declares 75 operations (G3 +15) and no interview_schedules.get (Ashby-0 cite-drop)", () => {
    expect(Object.keys(manifest.operations)).toHaveLength(75);
    expect(manifest.operations["interview_schedules.get"]).toBeUndefined();
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

  it("wires applications.transfer EffectPolicy Reconcile to applications.get", () => {
    const transfer = manifest.operations["applications.transfer"] as {
      kind: string;
      sideEffect: string;
      effectPolicy: string;
      reconcile: string;
    };
    expect(transfer.kind).toBe("action");
    expect(transfer.sideEffect).toBe("write");
    expect(transfer.effectPolicy).toBe("Reconcile");
    expect(transfer.reconcile).toBe("applications.get");
  });

  it("restores Reconcile on G1 fold-in writes after observe widening", () => {
    for (const [key, observe] of [
      ["candidates.add_tag", "candidates.get"],
      ["applications.change_source", "applications.get"],
      ["applications.update", "applications.get"],
    ] as const) {
      const op = manifest.operations[key] as {
        effectPolicy: string;
        reconcile: string;
        kind: string;
        sideEffect: string;
      };
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("write");
      expect(op.effectPolicy).toBe("Reconcile");
      expect(op.reconcile).toBe(observe);
    }
  });

  it("omits effect keys on remaining G1 creates/one-shots without exact observe", () => {
    for (const key of [
      "candidates.create_note",
      "candidate_tags.create",
      "application_feedback.submit",
      "hiring_team.add_member",
      "hiring_team.remove_member",
    ] as const) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(op.observe).toBeUndefined();
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("write");
    }
  });

  it("marks G1 reads as agent-tool actions", () => {
    for (const key of [
      "candidates.list_notes",
      "candidate_tags.list",
      "applications.list_history",
      "application_feedback.list",
      "hiring_team_roles.list",
      "users.get",
    ] as const) {
      const op = manifest.operations[key] as { kind: string; sideEffect: string };
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("read");
    }
  });

  it("wires G2 write EffectPolicy and marks G2 reads as agent tools", () => {
    for (const key of ["jobs.create", "openings.create"] as const) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(op.observe).toBeUndefined();
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("write");
    }
    expect(manifest.operations["jobs.update"].effectPolicy).toBe("Reconcile");
    expect(manifest.operations["jobs.update"].reconcile).toBe("jobs.get");
    expect(manifest.operations["jobs.set_status"].effectPolicy).toBe("Reconcile");
    expect(manifest.operations["jobs.set_status"].reconcile).toBe("jobs.get");
    expect(manifest.operations["job_postings.update"].effectPolicy).toBe("Reconcile");
    expect(manifest.operations["job_postings.update"].reconcile).toBe("job_postings.get");
    expect(manifest.operations["openings.update"].effectPolicy).toBe("Reconcile");
    expect(manifest.operations["openings.update"].reconcile).toBe("openings.get");

    for (const key of [
      "jobs.list_internal",
      "jobs.search",
      "job_templates.list",
      "job_interview_plans.get",
      "job_postings.list",
      "job_postings.get",
      "openings.get",
      "openings.search",
      "close_reasons.list",
    ] as const) {
      const op = manifest.operations[key] as { kind: string; sideEffect: string };
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("read");
      expect((op as Record<string, unknown>).effectPolicy).toBeUndefined();
    }
  });
  it("wires G3 opening writes Reconcile → openings.get", () => {
    for (const key of [
      "openings.set_archived",
      "openings.set_state",
      "openings.add_job",
      "openings.remove_job",
      "openings.add_location",
      "openings.remove_location",
    ] as const) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("write");
      expect(op.effectPolicy).toBe("Reconcile");
      expect(op.reconcile).toBe("openings.get");
      expect(op.observe).toBeUndefined();
    }
  });

  it("omits all effect keys on G3 creates (offers.create, offers.start, offer_processes.start)", () => {
    for (const key of ["offers.create", "offers.start", "offer_processes.start"] as const) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("write");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(op.observe).toBeUndefined();
    }
  });

  it("marks G3 reads as agent-tool actions without effect keys", () => {
    for (const key of [
      "locations.list",
      "locations.get",
      "departments.get",
      "users.search",
      "communication_templates.list",
      "application_hiring_team_roles.list",
    ] as const) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("read");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
    }
  });

  it("has no Idempotent op and no create-like op carrying effect keys", () => {
    const createLike = /\.(create|create_\w+|start|submit)$|^offer_processes\.start$/;
    for (const [key, raw] of Object.entries(manifest.operations)) {
      const op = raw as Record<string, unknown>;
      expect([key, op.effectPolicy]).not.toEqual([key, "Idempotent"]);
      if (createLike.test(key)) {
        expect([key, op.effectPolicy, op.reconcile, op.observe]).toEqual([
          key,
          undefined,
          undefined,
          undefined,
        ]);
      }
    }
  });
});
