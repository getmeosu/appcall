import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

describe("Greenhouse manifest", () => {
  it("has correct key", () => {
    expect(manifest.key).toBe("greenhouse");
  });

  it("has version 0.4.0", () => {
    expect(manifest.version).toBe("0.5.0");
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
    expect(manifest.network.allowedHosts).toEqual(["harvest.greenhouse.io", "boards-api.greenhouse.io"]);
  });

  it("uses Harvest v3 Basic auth and keeps boards host", () => {
    expect(manifest.http.baseUrl).toBe("https://harvest.greenhouse.io/v3");
    expect(manifest.http.auth.basic).toEqual({ username: "{{apiKey}}", password: "" });
    expect(manifest.network.allowedHosts).toContain("boards-api.greenhouse.io");
  });

  it("declares list/get + write/move + stages ops", () => {
    expect(manifest.operations["candidates.list"]).toBeTruthy();
    expect(manifest.operations["candidates.get"]).toBeTruthy();
    expect(manifest.operations["applications.list"]).toBeTruthy();
    expect(manifest.operations["applications.get"]).toBeTruthy();
    expect(manifest.operations["applications.move"]).toBeTruthy();
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

it("does not declare scorecards.list", () => {
    expect((manifest.operations as Record<string, unknown>)["scorecards.list"]).toBeUndefined();
  });

  it("declares authenticated healthcheck request", () => {
    expect(manifest.operations.healthcheck.request).toBeTruthy();
    expect(manifest.operations.healthcheck.kind).toBe("action");
  });

  it("declares job/candidate/application/user/interview/stage models", () => {
    expect(manifest.models).toEqual([
      "job",
      "candidate",
      "application",
      "user",
      "interview",
      "job_interview_stage",
    ]);
  });
});
