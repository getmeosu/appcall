import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";

describe("github connector manifest", () => {
  test("manifest declares key, runtime, and auth", () => {
    expect(manifest.key).toBe("github");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.auth.type).toBe("oauth2");
    expect(manifest.auth.scopes).toContain("repo");
    expect(manifest.auth.scopes).toContain("read:org");
    expect(manifest.auth.scopes).toContain("admin:repo_hook");
  });

  test("manifest declares network controls", () => {
    expect(manifest.network.allowedHosts).toContain("api.github.com");
    expect(manifest.network.allowedHosts).toContain("github.com");
  });

  test("manifest declares sync and action operations", () => {
    expect(manifest.operations["issues.list"].kind).toBe("sync");
    expect(manifest.operations["issues.create"].kind).toBe("action");
    expect(manifest.operations["issues.get"].kind).toBe("action");
    expect(manifest.operations["issues.update"].kind).toBe("action");
    expect(manifest.operations["issues.labels.add"].kind).toBe("action");
    expect(manifest.operations["issues.comments.create"].kind).toBe("action");
    expect(manifest.operations["pull_requests.list"].kind).toBe("sync");
    expect(manifest.operations["pull_requests.create"].kind).toBe("action");
    expect(manifest.operations["pull_requests.get"].kind).toBe("action");
    expect(manifest.operations["pull_requests.update"].kind).toBe("action");
    expect(manifest.operations["pull_requests.list_files"].kind).toBe("action");
    expect(manifest.operations["pull_requests.merge"].kind).toBe("action");
    expect(manifest.operations["repos.get"].kind).toBe("action");
    expect(manifest.operations["repos.create"].kind).toBe("action");
    expect(manifest.operations["repos.list"].kind).toBe("action");
    expect(manifest.operations["repos.contents.get"].kind).toBe("action");
    expect(manifest.operations["branches.get"].kind).toBe("action");
    expect(manifest.operations["branches.create"].kind).toBe("action");
    expect(manifest.operations["releases.create"].kind).toBe("action");
    expect(manifest.operations["gists.create"].kind).toBe("action");
    expect(manifest.operations["commits.list"].kind).toBe("sync");
    expect(manifest.operations["repositories.list"].kind).toBe("sync");
    expect(manifest.operations["healthcheck"].kind).toBe("action");
  });

  test("manifest declares models", () => {
    expect(manifest.models).toContain("issue");
    expect(manifest.models).toContain("pull_request");
    expect(manifest.models).toContain("commit");
    expect(manifest.models).toContain("repository");
    expect(manifest.models).toContain("issue_comment");
    expect(manifest.models).toContain("release");
    expect(manifest.models).toContain("gist");
    expect(manifest.models).toContain("branch");
    expect(manifest.models).toContain("label");
  });

  test("manifest has timeout and size limits on all operations", () => {
    for (const [op, spec] of Object.entries(manifest.operations)) {
      const s = spec as Record<string, unknown>;
      expect(typeof s.timeoutMs).toBe("number");
      expect((s.timeoutMs as number) > 0).toBe(true);
      expect(typeof s.maxInputBytes).toBe("number");
      expect(typeof s.maxResponseBytes).toBe("number");
    }
  });

  test("all action operations have title, description, and object inputSchema", () => {
    for (const [op, spec] of Object.entries(manifest.operations)) {
      const s = spec as Record<string, unknown>;
      if (s.kind !== "action") continue;
      expect(typeof s.title).toBe("string");
      expect((s.title as string).length > 0).toBe(true);
      expect(typeof s.description).toBe("string");
      expect((s.description as string).length > 0).toBe(true);
      const schema = s.inputSchema as Record<string, unknown>;
      expect(schema).toBeDefined();
      expect(schema.type).toBe("object");
    }
  });

  test("manifest has at least 26 action operations", () => {
    const actionOps = Object.entries(manifest.operations).filter(
      ([, spec]) => (spec as Record<string, unknown>).kind === "action"
    );
    expect(actionOps.length).toBeGreaterThanOrEqual(26);
  });

  test("manifest declares S2 issue deepen and search ops", () => {
    for (const key of [
      "issues.comments.list",
      "issues.comments.update",
      "issues.comments.delete",
      "issues.assignees.add",
      "issues.assignees.remove",
      "issues.labels.remove",
      "issues.labels.set",
      "issues.lock",
      "issues.unlock",
      "labels.list",
      "search.issues",
      "search.pull_requests",
    ] as const) {
      expect(manifest.operations[key].kind).toBe("action");
    }
  });

  test("S2 write ops wire EffectPolicy Reconcile to issues.get", () => {
    const writes = [
      "issues.comments.update",
      "issues.comments.delete",
      "issues.assignees.add",
      "issues.assignees.remove",
      "issues.labels.remove",
      "issues.labels.set",
      "issues.lock",
      "issues.unlock",
    ];
    for (const key of writes) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.sideEffect).toBe("write");
      expect(op.effectPolicy).toBe("Reconcile");
      expect(op.reconcile).toBe("issues.get");
    }
  });

  test("manifest version is 0.2.0 after S2", () => {
    expect(manifest.version).toBe("0.2.0");
  });
});
