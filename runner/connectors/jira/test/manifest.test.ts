import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

describe("jira manifest", () => {
  it("has correct key and version", () => {
    expect(manifest.key).toBe("jira");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.runtime).toBe("bun");
  });

  it("uses oauth2 auth with scopes", () => {
    expect(manifest.auth.type).toBe("oauth2");
    expect(manifest.auth.setup.mode).toBe("oauth2");
    expect(manifest.auth.scopes).toContain("read:jira-work");
    expect(manifest.auth.scopes).toContain("write:jira-work");
    expect(manifest.auth.scopes).toContain("read:jira-user");
  });

  it("allows atlassian hosts", () => {
    expect(manifest.network.allowedHosts).toContain("api.atlassian.com");
    expect(manifest.network.allowedHosts).toContain("auth.atlassian.com");
  });

  it("has all expected operations", () => {
    const ops = Object.keys(manifest.operations);
    // existing operations
    expect(ops).toContain("issues.search");
    expect(ops).toContain("projects.list");
    expect(ops).toContain("users.list");
    expect(ops).toContain("issues.create");
    expect(ops).toContain("healthcheck");
    // new action operations
    expect(ops).toContain("issues.get");
    expect(ops).toContain("issues.update");
    expect(ops).toContain("issues.delete");
    expect(ops).toContain("issues.jql_search");
    expect(ops).toContain("issues.comments.add");
    expect(ops).toContain("issues.comments.list");
    expect(ops).toContain("issues.transitions.list");
    expect(ops).toContain("issues.transitions.do");
    expect(ops).toContain("issues.assign");
    expect(ops).toContain("projects.get");
    expect(ops).toContain("users.get");
  });

  it("has at least 15 operations total", () => {
    const ops = Object.keys(manifest.operations);
    expect(ops.length).toBeGreaterThanOrEqual(15);
  });

  it("all action operations have required metadata", () => {
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    for (const [key, op] of Object.entries(ops)) {
      if (op.kind !== "action") continue;
      expect(typeof op.title).toBe("string");
      expect((op.title as string).length).toBeGreaterThan(0);
      expect(typeof op.description).toBe("string");
      expect((op.description as string).length).toBeGreaterThan(0);
      expect(typeof op.timeoutMs).toBe("number");
      expect(typeof op.maxInputBytes).toBe("number");
      expect(typeof op.maxResponseBytes).toBe("number");
      const schema = op.inputSchema as any;
      expect(schema).toBeDefined();
      expect(schema.type).toBe("object");
    }
  });

  it("has correct models", () => {
    expect(manifest.models).toEqual(["issue", "project", "user"]);
  });
});
