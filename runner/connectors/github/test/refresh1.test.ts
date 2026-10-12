import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import coverage from "../fixtures/composio-coverage.json";
import { listRepos, updateIssue } from "../src/actions";
import { pathValueViolation } from "../src/path_values";

// REFRESH-1 (v0.89.2, +1 op = 860): Composio GitHub toolkit 20261007_00 (897 tools; gate 825).
// - rest.issues.remove_blocked_by_dependency closes GITHUB_MANAGE_ISSUE_BLOCKING_DEPENDENCY (824 -> 825).
// - issues.update gains stateReason (GITHUB_CLOSE_ISSUE / GITHUB_REOPEN_ISSUE).
// - repos.list gains visibility and affiliation (GITHUB_LIST_REPOSITORIES).

const ops = manifest.operations as Record<string, Record<string, any>>;

function capture(status = 200, body: unknown = {}) {
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  const fetchFn = async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method ?? "GET", body: typeof init?.body === "string" ? init.body : undefined });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
  return { calls, fetchFn };
}

describe("REFRESH-1", () => {
  test("remove_blocked_by_dependency: DELETE detach, write (reversible), no effect keys, path guards", () => {
    const op = ops["rest.issues.remove_blocked_by_dependency"]!;
    expect(op.kind).toBe("action");
    expect(op.sideEffect).toBe("write");
    expect(op.request.method).toBe("DELETE");
    expect(op.request.path).toBe("/repos/{{owner}}/{{repo}}/issues/{{issue_number}}/dependencies/blocked_by/{{issue_id}}");
    expect(op.request.success).toEqual([200]);
    expect(op.request.body).toBeUndefined();
    expect(op.inputSchema.required).toEqual(["owner", "repo", "issue_number", "issue_id"]);
    for (const k of ["effectPolicy", "reconcile", "reconcileInput", "effect"]) expect(op[k], k).toBeUndefined();
    expect(pathValueViolation("rest.issues.remove_blocked_by_dependency", { owner: " ", repo: "r", issue_number: 1, issue_id: 2 })).not.toBeNull();
    expect(pathValueViolation("rest.issues.remove_blocked_by_dependency", { owner: "o", repo: "r ", issue_number: 1, issue_id: 2 })).not.toBeNull();
    expect(pathValueViolation("rest.issues.remove_blocked_by_dependency", { owner: "o", repo: "r", issue_number: 1, issue_id: 2 })).toBeNull();
    expect((coverage.mapped as Record<string, string>).GITHUB_MANAGE_ISSUE_BLOCKING_DEPENDENCY).toBe("rest.issues.remove_blocked_by_dependency");
  });

  test("issues.update sends state_reason; bad values are rejected before any fetch", async () => {
    expect(ops["issues.update"]!.inputSchema.properties.stateReason.enum).toEqual(["completed", "not_planned", "duplicate", "reopened"]);
    const { calls, fetchFn } = capture(200, { id: 1, number: 7, state: "closed" });
    await updateIssue({ accessToken: "t", fetch: fetchFn, owner: "o", repo: "r", issueNumber: 7, state: "closed", stateReason: "not_planned" });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe("PATCH");
    expect(JSON.parse(calls[0]!.body!)).toEqual({ state: "closed", state_reason: "not_planned" });
    const reopen = capture(200, { id: 1, number: 7, state: "open" });
    await updateIssue({ accessToken: "t", fetch: reopen.fetchFn, owner: "o", repo: "r", issueNumber: 7, state: "open", stateReason: "reopened" });
    expect(JSON.parse(reopen.calls[0]!.body!).state_reason).toBe("reopened");
    const bad = capture();
    expect(() => updateIssue({ accessToken: "t", fetch: bad.fetchFn, owner: "o", repo: "r", issueNumber: 7, stateReason: "wontfix" })).toThrow(/stateReason/);
    expect(bad.calls).toHaveLength(0);
    const plain = capture(200, { id: 1, number: 7 });
    await updateIssue({ accessToken: "t", fetch: plain.fetchFn, owner: "o", repo: "r", issueNumber: 7, title: "x" });
    expect(JSON.parse(plain.calls[0]!.body!)).toEqual({ title: "x" });
  });

  test("repos.list sends visibility and affiliation; type cannot be combined with them", async () => {
    const props = ops["repos.list"]!.inputSchema.properties;
    expect(props.visibility.enum).toEqual(["all", "public", "private"]);
    expect(props.affiliation.type).toBe("string");
    const { calls, fetchFn } = capture(200, []);
    await listRepos({ accessToken: "t", fetch: fetchFn, visibility: "private", affiliation: "owner,organization_member" });
    expect(calls[0]!.url).toBe("https://api.github.com/user/repos?visibility=private&affiliation=owner%2Corganization_member");
    const arr = capture(200, []);
    await listRepos({ accessToken: "t", fetch: arr.fetchFn, affiliation: ["collaborator"] });
    expect(arr.calls[0]!.url).toBe("https://api.github.com/user/repos?affiliation=collaborator");
    for (const input of [{ visibility: "internal" }, { affiliation: "friend" }, { affiliation: "" }, { type: "owner", visibility: "all" }, { type: "all", affiliation: "owner" }]) {
      const bad = capture(200, []);
      expect(() => listRepos({ accessToken: "t", fetch: bad.fetchFn, ...input }), JSON.stringify(input)).toThrow();
      expect(bad.calls).toHaveLength(0);
    }
    const legacy = capture(200, []);
    await listRepos({ accessToken: "t", fetch: legacy.fetchFn, type: "owner" });
    expect(legacy.calls[0]!.url).toBe("https://api.github.com/user/repos?type=owner");
  });
});
