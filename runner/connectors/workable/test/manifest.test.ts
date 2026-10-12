import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";
import { WORKABLE_ACTION_KEYS } from "../src/actions";

describe("Workable manifest", () => {
  it("has correct key", () => {
    expect(manifest.key).toBe("workable");
  });

  it("has version 0.6.2", () => {
    expect(manifest.version).toBe("0.6.2");
  });

  it("uses bun runtime", () => {
    expect(manifest.runtime).toBe("bun");
  });

  it("requires bearer auth with accessToken + account", () => {
    expect(manifest.auth.type).toBe("bearer");
    const fields = manifest.auth.setup.fields.map((f: { key: string }) => f.key);
    expect(fields).toContain("accessToken");
    expect(fields).toContain("account");
  });

  // SPI base is {account}.workable.com/spi/v3 — wildcard covers tenant subdomains.
  it("allows workable subdomains and the accounts apex", () => {
    expect(manifest.network.allowedHosts).toEqual(["*.workable.com", "workable.com"]);
  });

  it("keeps the existing sync operations and declares validated action tools", () => {
    expect(Object.keys(manifest.operations)).toHaveLength(41);
    for (const operation of ["jobs.list", "jobs.get", "candidates.list", "candidates.get", "stages.list", "members.list", "events.list"]) {
      expect(manifest.operations[operation].kind).toBe("sync");
    }
    const actions = Object.values(manifest.operations).filter((operation) => operation.kind === "action");
    expect(actions.length).toBe(34);
    expect(actions.filter((action) => action.title !== "Healthcheck").length).toBe(WORKABLE_ACTION_KEYS.length);
    expect(Object.keys(manifest.operations).filter((key) => key !== "healthcheck" && manifest.operations[key].kind === "action").sort())
      .toEqual([...WORKABLE_ACTION_KEYS].sort());
    for (const action of actions) {
      expect(action.description.length).toBeGreaterThan(0);
      expect(action.inputSchema.type).toBe("object");
      expect(action.sideEffect).toMatch(/^(read|write)$/);
    }
    for (const [name, operation] of Object.entries(manifest.operations)) {
      expect(operation.request?.method, name).toMatch(/^(GET|POST|PUT|PATCH|DELETE)$/);
      expect(operation.request?.path, name).toMatch(/^\//);
      expect(operation.maxResponseBytes).toBeGreaterThanOrEqual(operation.maxInputBytes);
      if (operation.request.method === "GET" || operation.request.method === "DELETE") {
        expect(operation.request.body, name).toBeUndefined();
      }
      const contentType = operation.request.headers?.["Content-Type"];
      if (operation.request.body === undefined) expect(contentType, name).toBeUndefined();
      else expect(contentType, name).toBe("application/json");
    }
    expect(manifest.operations["departments.create"].sideEffect).toBe("write");
    expect(manifest.operations["employees.get"].sideEffect).toBe("read");
    expect(manifest.operations["background_checks.update"].sideEffect).toBe("write");
    expect(manifest.operations["background_checks.update"].inputSchema.required).toEqual([
      "backgroundCheckId",
      "status",
    ]);
  });

  it("declares job, candidate, stage, member, event models", () => {
    expect(manifest.models).toEqual(expect.arrayContaining(["job", "candidate", "stage", "member", "event", "employee", "department", "requisition"]));
  });
});
