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

  test("manifest has at least 14 action operations", () => {
    const actionOps = Object.entries(manifest.operations).filter(
      ([, spec]) => (spec as Record<string, unknown>).kind === "action"
    );
    expect(actionOps.length).toBeGreaterThanOrEqual(14);
  });
});
