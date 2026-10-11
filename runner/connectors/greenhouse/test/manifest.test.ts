import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

describe("Greenhouse manifest", () => {
  it("has correct key", () => {
    expect(manifest.key).toBe("greenhouse");
  });

  it("has version 0.11.0", () => {
    expect(manifest.version).toBe("0.11.0");
  });

  it("uses bun runtime", () => {
    expect(manifest.runtime).toBe("bun");
  });

  it("declares OAuth client credential fields (no Harvest apiKey)", () => {
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.auth.setup.mode).toBe("api_key");
    const keys = manifest.auth.setup.fields.map((field: { key: string }) => field.key);
    expect(keys).toContain("clientId");
    expect(keys).toContain("clientSecret");
    expect(keys).toContain("userId");
    expect(keys).not.toContain("apiKey");
  });

  it("allows Harvest, boards, and auth hosts", () => {
    expect(manifest.network.allowedHosts).toEqual([
      "harvest.greenhouse.io",
      "boards-api.greenhouse.io",
      "auth.greenhouse.io",
    ]);
  });

  it("documents Bearer auth metadata (token minted at runtime)", () => {
    expect(manifest.http.baseUrl).toBe("https://harvest.greenhouse.io/v3");
    expect(manifest.http.auth.value).toBe("Bearer {{accessToken}}");
    expect((manifest.http.auth as { basic?: unknown }).basic).toBeUndefined();
  });

  it("declares list/get + write/move + stages ops", () => {
    expect(manifest.operations["candidates.list"]).toBeTruthy();
    expect(manifest.operations["candidates.get"]).toBeTruthy();
    expect(manifest.operations["applications.list"]).toBeTruthy();
    expect(manifest.operations["applications.get"]).toBeTruthy();
    expect(manifest.operations["applications.move"]).toBeTruthy();
    expect(manifest.operations["applications.create"]).toBeTruthy();
    expect(manifest.operations["users.list"]).toBeTruthy();
    expect(manifest.operations["jobs.list"]).toBeTruthy();
    expect(manifest.operations["jobs.get"]).toBeTruthy();
    expect(manifest.operations["interviews.list"]).toBeTruthy();
    expect(manifest.operations["job_interview_stages.list"]).toBeTruthy();
  });

  it("wires applications.move EffectPolicy Reconcile to applications.get", () => {
    const move = manifest.operations["applications.move"] as {
      kind: string;
      sideEffect: string;
      effectPolicy: string;
      reconcile: string;
    };
    expect(move.kind).toBe("action");
    expect(move.sideEffect).toBe("write");
    expect(move.effectPolicy).toBe("Reconcile");
    expect(move.reconcile).toBe("applications.get");
  });

  it("omits effect keys on every create op (creates always omit)", () => {
    const creates = Object.entries(manifest.operations).filter(([id]) => id.endsWith(".create"));
    expect(creates.map(([id]) => id)).toContain("applications.create");
    expect(creates.map(([id]) => id)).toContain("candidates.create");
    expect(creates.map(([id]) => id)).toContain("offers.create");
    for (const [, op] of creates) {
      const record = op as Record<string, unknown>;
      expect(record.kind).toBe("action");
      expect(record.sideEffect).toBe("write");
      expect(record.effectPolicy).toBeUndefined();
      expect(record.reconcile).toBeUndefined();
      expect(record.effect).toBeUndefined();
    }
  });

  it("types customFields as the Harvest v3 array on applications.update and offers.create", () => {
    for (const id of ["applications.update", "offers.create"] as const) {
      const op = manifest.operations[id] as {
        inputSchema: { properties: { customFields: { type: string; items: { type: string } } } };
      };
      expect(op.inputSchema.properties.customFields.type).toBe("array");
      expect(op.inputSchema.properties.customFields.items.type).toBe("object");
    }
  });

  it("requires rejectionReasonId on applications.reject", () => {
    const reject = manifest.operations["applications.reject"] as {
      inputSchema: { required: string[] };
    };
    expect(reject.inputSchema.required).toContain("id");
    expect(reject.inputSchema.required).toContain("rejectionReasonId");
  });

  it("declares scorecards, offers, and candidate write ops", () => {
    expect(manifest.operations["scorecards.list"]).toBeTruthy();
    expect(manifest.operations["scorecards.get"]).toBeTruthy();
    expect(manifest.operations["offers.list"]).toBeTruthy();
    expect(manifest.operations["offers.get"]).toBeTruthy();
    expect(manifest.operations["candidates.create"]).toBeTruthy();
    expect(manifest.operations["candidates.update"]).toBeTruthy();
    expect(manifest.operations["applications.reject"]).toBeTruthy();
    expect(manifest.operations["departments.list"]).toBeTruthy();
    expect(manifest.operations["offices.list"]).toBeTruthy();
    expect(manifest.operations["sources.list"]).toBeTruthy();
    expect(manifest.operations["close_reasons.list"]).toBeTruthy();
    expect(manifest.operations["users.get"]).toBeTruthy();
  });

  it("keeps healthcheck as a code-backed action (no declarative request)", () => {
    expect(manifest.operations.healthcheck.kind).toBe("action");
    expect((manifest.operations.healthcheck as { request?: unknown }).request).toBeUndefined();
  });

  it("declares job/candidate/application/user/interview/stage models", () => {
    for (const model of [
      "job",
      "candidate",
      "application",
      "user",
      "interview",
      "job_interview_stage",
      "offer",
      "scorecard",
      "department",
      "office",
      "source",
      "close_reason",
      "application_stage",
      "rejection_reason",
      "rejection_detail",
      "note",
      "candidate_tag",
      "applied_candidate_tag",
      "attachment",
      "candidate_education",
      "candidate_employment",
      "job_post",
      "opening",
      "job_owner",
      "job_hiring_manager",
      "job_note",
      "job_interview",
      "default_interviewer",
      "interviewer_tag",
      "referrer",
      "email_template",
    ]) {
      expect(manifest.models).toContain(model);
    }
  });

  it("stays at 75 ops on v0.11.0", () => {
    expect(Object.keys(manifest.operations)).toHaveLength(75);
  });
});

  it("wires G1 Reconcile and omits effect keys on create/delete/list tools", () => {
    const hire = manifest.operations["applications.hire"] as {
      effectPolicy: string;
      reconcile: string;
      sideEffect: string;
    };
    expect(hire.effectPolicy).toBe("Reconcile");
    expect(hire.reconcile).toBe("applications.get");
    expect(hire.sideEffect).toBe("write");

    const update = manifest.operations["applications.update"] as {
      effectPolicy: string;
      reconcile: string;
    };
    expect(update.effectPolicy).toBe("Reconcile");
    expect(update.reconcile).toBe("applications.get");

    const applyTag = manifest.operations["candidates.apply_tag"] as Record<string, unknown>;
    expect(applyTag.sideEffect).toBe("write");
    expect(applyTag.effectPolicy).toBeUndefined();
    expect(applyTag.reconcile).toBeUndefined();
    expect(applyTag.effect).toBeUndefined();

    const offer = manifest.operations["offers.create"] as Record<string, unknown>;
    expect(offer.effectPolicy).toBeUndefined();
    expect(offer.reconcile).toBeUndefined();

    for (const id of [
      "application_stages.list",
      "rejection_reasons.list",
      "rejection_details.list",
      "notes.create",
      "notes.list",
      "candidate_tags.list",
      "candidates.remove_tag",
      "interviews.create",
      "interviews.update",
      "interviews.delete",
      "jobs.list_internal",
    ] as const) {
      const op = manifest.operations[id] as Record<string, unknown>;
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(op.kind).toBe("action");
    }
    expect((manifest.operations["interviews.delete"] as { sideEffect: string }).sideEffect).toBe(
      "destructive",
    );
    expect((manifest.operations["application_stages.list"] as { sideEffect: string }).sideEffect).toBe(
      "read",
    );
  });
