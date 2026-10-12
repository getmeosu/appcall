import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { getCheckRun, listCheckAnnotations, listCheckSuitesForRef } from "../src/actions";
import { normalizeCheckAnnotation, normalizeGitHubCheckRun, normalizeGitHubCheckSuite } from "../src/checks";
import {
  normalizeArtifact,
  normalizePendingDeployment,
  normalizeRunApproval,
  normalizeWorkflowJob,
  normalizeWorkflowRun,
} from "../src/workflows";

// TR-5a (v0.89.1, +0 ops): Actions + checks normalizers. A field that is optional or nullable in the
// exact pinned-spec schema (workflow-run, job, artifact, pending-deployment, environment-approvals,
// check-run, check-suite, check-annotation) comes back null, never a fabricated '' / 0. Spec-required
// fields keep their fallback (standing rule). Every assertion below failed on v0.89.0.

const ops = manifest.operations as Record<string, { outputSchema?: Record<string, unknown> }>;

describe("TR-5a: sparse upstream objects normalize to null, not fabricated values", () => {
  test("workflow-run: name, head_branch, status, conclusion (nullable), run_started_at, actor (optional)", () => {
    const run = normalizeWorkflowRun({ id: 1, name: null, head_branch: null, status: null, conclusion: null });
    expect([run.name, run.headBranch, run.status, run.conclusion, run.runStartedAt, run.actor]).toEqual([null, null, null, null, null, null]);
    const full = normalizeWorkflowRun({ id: 1, name: "CI", head_branch: "main", status: "completed", conclusion: "success", run_started_at: "t", actor: { login: "octocat" } });
    expect([full.name, full.headBranch, full.status, full.conclusion, full.runStartedAt, full.actor]).toEqual(["CI", "main", "completed", "success", "t", "octocat"]);
  });

  test("job: conclusion, head_branch, html_url, completed_at (nullable); required fields unchanged", () => {
    const job = normalizeWorkflowJob({ id: 2, run_id: 1, name: "build", status: "in_progress", started_at: "t", conclusion: null, head_branch: null, html_url: null, completed_at: null });
    expect([job.conclusion, job.headBranch, job.htmlUrl, job.completedAt]).toEqual([null, null, null, null]);
    expect([job.runId, job.name, job.status, job.startedAt]).toEqual([1, "build", "in_progress", "t"]);
  });

  test("artifact: created_at, updated_at, expires_at (nullable), workflow_run (optional) -> runId null, not 0", () => {
    const artifact = normalizeArtifact({ id: 3, name: "a", created_at: null, updated_at: null, expires_at: null });
    expect([artifact.createdAt, artifact.updatedAt, artifact.expiresAt, artifact.runId]).toEqual([null, null, null, null]);
  });

  test("pending-deployment: wait_timer_started_at (nullable), environment.id / name (optional)", () => {
    const pending = normalizePendingDeployment({ environment: {}, wait_timer: 0, wait_timer_started_at: null, current_user_can_approve: false });
    expect([pending.environmentId, pending.environment, pending.waitTimerStartedAt]).toEqual([null, null, null]);
  });

  test("environment-approvals: created_at is not in the schema -> null; state / comment (required) unchanged", () => {
    const approval = normalizeRunApproval({ state: "approved", comment: "ok", user: { login: "octocat" }, environments: [] });
    expect(approval.createdAt).toBeNull();
    expect([approval.state, approval.comment]).toEqual(["approved", "ok"]);
  });

  test("check-run: conclusion, html_url, details_url, started_at, completed_at, app (nullable)", () => {
    const run = normalizeGitHubCheckRun({ id: 4, name: "lint", status: "queued", head_sha: "a", conclusion: null, html_url: null, details_url: null, started_at: null, completed_at: null, app: null });
    expect([run.conclusion, run.url, run.detailsUrl, run.startedAt, run.completedAt, run.appName]).toEqual([null, null, null, null, null, null]);
    expect(normalizeGitHubCheckRun({ id: 4, app: { slug: "ci" } }).appName).toBe("ci");
  });

  test("check-suite: status, conclusion, head_branch, url, app (nullable); head_sha (required) unchanged", () => {
    const suite = normalizeGitHubCheckSuite({ id: 5, head_sha: "b", status: null, conclusion: null, head_branch: null, url: null, app: null });
    expect([suite.status, suite.conclusion, suite.headBranch, suite.url, suite.appName]).toEqual([null, null, null, null, null]);
    expect(suite.headSha).toBe("b");
  });

  test("check-annotation: annotation_level, message (nullable); path (required) unchanged", () => {
    const annotation = normalizeCheckAnnotation({ path: "a.ts", start_line: 1, end_line: 1, annotation_level: null, message: null });
    expect([annotation.annotationLevel, annotation.message, annotation.path]).toEqual([null, null, "a.ts"]);
  });
});

function mockFetch(body: unknown) {
  return (async () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
}

function conforms(schema: Record<string, unknown>, value: unknown, path = "$"): void {
  const type = schema.type;
  const kind = value === null ? "null" : Array.isArray(value) ? "array" : typeof value === "number" ? "number" : typeof value;
  if (type !== undefined) {
    const allowed = Array.isArray(type) ? type : [type];
    expect(allowed.includes(kind) || (kind === "number" && allowed.includes("integer")), `${path}: ${kind} not in ${JSON.stringify(type)}`).toBe(true);
  }
  if (kind === "object" && schema.properties) {
    for (const [key, sub] of Object.entries(schema.properties as Record<string, Record<string, unknown>>)) {
      if (key in (value as Record<string, unknown>)) conforms(sub, (value as Record<string, unknown>)[key], `${path}.${key}`);
    }
  }
  if (kind === "array" && schema.items) for (const [i, item] of (value as unknown[]).entries()) conforms(schema.items as Record<string, unknown>, item, `${path}[${i}]`);
}

describe("TR-5a: the declared output schemas admit the nulls", () => {
  const base = { owner: "octo", repo: "r", accessToken: "t" };
  test("checks.runs.get", async () => {
    const out = await getCheckRun({ ...base, checkRunId: 4, fetch: mockFetch({ id: 4, name: "lint", status: "queued", head_sha: "a", conclusion: null, html_url: null, details_url: null, started_at: null, completed_at: null, app: null }) });
    expect((out.checkRun as Record<string, unknown>).conclusion).toBeNull();
    conforms(ops["checks.runs.get"].outputSchema!, out);
  });
  test("checks.suites.list_for_ref", async () => {
    const out = await listCheckSuitesForRef({ ...base, ref: "main", fetch: mockFetch({ total_count: 1, check_suites: [{ id: 5, head_sha: "b", status: null, conclusion: null, head_branch: null, url: null, app: null }] }) });
    expect((out.checkSuites as Record<string, unknown>[])[0]!.headBranch).toBeNull();
    conforms(ops["checks.suites.list_for_ref"].outputSchema!, out);
  });
  test("checks.annotations.list", async () => {
    const out = await listCheckAnnotations({ ...base, checkRunId: 4, fetch: mockFetch([{ path: "a.ts", start_line: 1, end_line: 1, annotation_level: null, message: null }]) });
    expect((out.annotations as Record<string, unknown>[])[0]!.message).toBeNull();
    conforms(ops["checks.annotations.list"].outputSchema!, out);
  });
  test("widened properties are exactly the TR-5a set", () => {
    const nullable: string[] = [];
    const walk = (op: string, s: unknown, p: string) => {
      if (!s || typeof s !== "object") return;
      const o = s as Record<string, unknown>;
      if (Array.isArray(o.type) && o.type.includes("null")) nullable.push(`${op}${p}`);
      for (const [k, v] of Object.entries(o)) walk(op, v, k === "properties" || k === "items" ? p : `${p}.${k}`);
    };
    for (const op of ["checks.runs.list_for_ref", "checks.runs.list_for_suite", "checks.runs.get", "checks.runs.create", "checks.suites.list_for_ref", "checks.annotations.list"]) walk(op, ops[op].outputSchema, "");
    expect(nullable.sort()).toEqual([
      "checks.annotations.list.annotations.annotationLevel",
      "checks.annotations.list.annotations.message",
      "checks.runs.create.checkRun.conclusion",
      "checks.runs.create.checkRun.url",
      "checks.runs.get.checkRun.conclusion",
      "checks.runs.get.checkRun.url",
      "checks.runs.list_for_ref.checkRuns.conclusion",
      "checks.runs.list_for_suite.checkRuns.conclusion",
      "checks.suites.list_for_ref.checkSuites.conclusion",
      "checks.suites.list_for_ref.checkSuites.headBranch",
      "checks.suites.list_for_ref.checkSuites.status",
    ]);
  });
});
