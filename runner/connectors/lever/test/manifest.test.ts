import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

describe("Lever manifest", () => {
  it("has correct key", () => {
    expect(manifest.key).toBe("lever");
  });

  it("has version 0.5.1", () => {
    expect(manifest.version).toBe("0.5.1");
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
    expect(manifest.network.allowedHosts).toEqual(["api.lever.co", "api.eu.lever.co"]);
  });

  it("requires region for US/EU host selection", () => {
    expect(manifest.auth.setup.fields.some((field: { key: string }) => field.key === "region")).toBe(true);
    // Declarative default is the US root; custom handlers map region=eu → api.eu.lever.co.
    expect(manifest.http.baseUrl).toBe("https://api.lever.co/v1");
    expect(manifest.http.auth.basic).toEqual({ username: "{{apiKey}}", password: "" });
  });

  it("declares authenticated healthcheck request", () => {
    expect(manifest.operations.healthcheck.request).toBeTruthy();
    expect(manifest.operations.healthcheck.kind).toBe("action");
  });

  it("declares list/get/write depth ops", () => {
    expect(Object.keys(manifest.operations).sort()).toEqual([
      "archive_reasons.list",
      "candidates.get",
      "feedback.get",
      "healthcheck",
      "interviews.get",
      "interviews.list",
      "jobs.list",
      "notes.list",
      "offers.get",
      "offers.list",
      "opportunities.archive",
      "opportunities.feedback.list",
      "opportunities.get",
      "opportunities.interviews.list",
      "opportunities.list",
      "opportunities.update",
      "opportunities.update_stage",
      "postings.get",
      "postings.list",
      "requisitions.list",
      "stages.list",
      "users.get",
      "users.list",
    ]);
    expect(manifest.operations["jobs.list"].kind).toBe("sync");
    expect(manifest.operations["opportunities.list"].kind).toBe("sync");
    expect(manifest.operations["opportunities.get"].kind).toBe("sync");
    expect(manifest.operations["opportunities.interviews.list"].kind).toBe("sync");
    expect(manifest.operations["opportunities.feedback.list"].kind).toBe("sync");
    expect(manifest.operations["stages.list"].kind).toBe("sync");
    expect(manifest.operations["users.list"].kind).toBe("sync");
    expect(manifest.operations["archive_reasons.list"].kind).toBe("action");
    expect(manifest.operations["archive_reasons.list"].sideEffect).toBe("read");
  });

  it("wires opportunities.update_stage EffectPolicy Reconcile to opportunities.get", () => {
    const op = manifest.operations["opportunities.update_stage"] as {
      kind: string;
      sideEffect: string;
      effectPolicy: string;
      reconcile: string;
      request: { method: string; body: { stage: string } };
    };
    expect(op.kind).toBe("action");
    expect(op.sideEffect).toBe("write");
    expect(op.effectPolicy).toBe("Reconcile");
    expect(op.reconcile).toBe("opportunities.get");
    expect(op.request.method).toBe("PUT");
    // Official Lever body field is `stage` (Stage UID).
    expect(op.request.body.stage).toBe("{{stageId}}");
  });

  it("wires opportunities.archive EffectPolicy Reconcile to opportunities.get", () => {
    const op = manifest.operations["opportunities.archive"] as {
      kind: string;
      sideEffect: string;
      effectPolicy: string;
      reconcile: string;
      request: { method: string; body: { reason: string } };
    };
    expect(op.kind).toBe("action");
    expect(op.sideEffect).toBe("write");
    expect(op.effectPolicy).toBe("Reconcile");
    expect(op.reconcile).toBe("opportunities.get");
    expect(op.request.method).toBe("PUT");
    expect(op.request.body.reason).toBe("{{reason}}");
  });

  it("declares job, opportunity, stage, user, interview, feedback, archive_reason models", () => {
    expect(manifest.models).toEqual([
      "job",
      "opportunity",
      "stage",
      "user",
      "interview",
      "feedback",
      "archive_reason",
      "candidate",
      "offer",
      "posting",
      "note",
      "requisition",
    ]);
  });

  it("wires opportunities.update EffectPolicy Reconcile to opportunities.get", () => {
    const op = manifest.operations["opportunities.update"] as {
      kind: string;
      sideEffect: string;
      effectPolicy: string;
      reconcile: string;
    };
    expect(op.kind).toBe("action");
    expect(op.sideEffect).toBe("write");
    expect(op.effectPolicy).toBe("Reconcile");
    expect(op.reconcile).toBe("opportunities.get");
  });
});
