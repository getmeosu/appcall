import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import {
  normalizeCodeScanningAlert,
  normalizeCodeScanningAnalysis,
  normalizeDependabotAlert,
  normalizeSecretScanningAlert,
} from "../src/alerts";
import { normalizeRoleTeam, normalizeTeam, normalizeTeamInvitation, normalizeTeamRepoPermission } from "../src/card13_reads";
import {
  normalizeCodeqlDatabase,
  normalizeGlobalAdvisory,
  normalizeOrgCodeScanningAlert,
  normalizePagesBuild,
  normalizeSarifUpload,
} from "../src/card16_reads";
import { normalizeGitHubDeploymentStatus } from "../src/deployments";
import { normalizeCommunityProfile, normalizeReadme } from "../src/repos_reads";
import { normalizeWorkflowRun } from "../src/workflows";

// TR-5b (v0.89.3, +0 ops): alerts / card13 / card16 / repos_reads / deployments normalizers. A field
// that is optional or nullable in the exact pinned-spec (58b1e0c0) schema comes back null, never a
// fabricated '' / 0 / 1. Spec-required fields keep their fallback. Every assertion below failed on v0.89.2 (REFRESH-1).

const ops = manifest.operations as Record<string, { outputSchema?: Record<string, unknown> }>;

function typeAt(op: string, path: string): unknown {
  let s = ops[op]?.outputSchema as Record<string, any>;
  for (const raw of path.split(".")) {
    const arr = raw.endsWith("[]");
    s = s.properties[arr ? raw.slice(0, -2) : raw];
    if (arr) s = s.items;
  }
  return s.type;
}

describe("TR-5b: sparse upstream objects normalize to null, not fabricated values", () => {
  test("code-scanning alert: state (nullable), rule.id / rule.severity (nullable), tool.name, updated_at (optional)", () => {
    const a = normalizeCodeScanningAlert({ number: 1, state: null, html_url: "h", created_at: "t", rule: { id: null, severity: null }, tool: {} });
    expect([a.state, a.ruleId, a.severity, a.toolName, a.updatedAt]).toEqual([null, null, null, null, null]);
    expect([a.number, a.htmlUrl, a.createdAt]).toEqual([1, "h", "t"]);
  });

  test("code-scanning analysis: category (optional), tool.name / version / guid (optional, nullable)", () => {
    const a = normalizeCodeScanningAnalysis({ id: 1, ref: "r", tool: { version: null, guid: null } });
    expect([a.category, a.tool.name, a.tool.version, a.tool.guid]).toEqual([null, null, null, null]);
    expect(a.ref).toBe("r");
  });

  test("dependabot alert: dependency.package / manifest_path (optional) -> null; required fields unchanged", () => {
    const a = normalizeDependabotAlert({ number: 2, state: "open", dependency: {}, security_advisory: { severity: "high" } });
    expect([a.packageName, a.manifestPath]).toEqual([null, null]);
    expect([a.number, a.state, a.severity]).toEqual([2, "open", "high"]);
  });

  test("secret-scanning alert: every metadata field is optional in the spec -> null, not '' / 0", () => {
    const a = normalizeSecretScanningAlert({});
    expect([a.number, a.state, a.secretType, a.htmlUrl, a.createdAt, a.updatedAt]).toEqual([null, null, null, null, null, null]);
  });

  test("card13: team description (nullable) / privacy (optional), invitation login / email (nullable), role_name (optional)", () => {
    const t = normalizeTeam({ id: 1, name: "n", slug: "s", description: null, permission: "pull" });
    expect([t.description, t.privacy]).toEqual([null, null]);
    expect([t.name, t.slug, t.permission]).toEqual(["n", "s", "pull"]);
    expect(normalizeRoleTeam({ id: 1 }).description).toBeNull();
    const inv = normalizeTeamInvitation({ id: 1, login: null, email: null, role: "direct_member", created_at: "t" });
    expect([inv.login, inv.email, inv.role]).toEqual([null, null, "direct_member"]);
    expect(normalizeTeamRepoPermission({ id: 1, name: "r", full_name: "o/r" }).roleName).toBeNull();
  });

  test("card16: pages error.message, sarif status, codeql commit_oid, org alert state / rule.id, advisory cve / description / withdrawn_at", () => {
    expect(normalizePagesBuild({ url: "u", status: "built", error: { message: null } }).errorMessage).toBeNull();
    const sarif = normalizeSarifUpload({});
    expect([sarif.processingStatus, sarif.analysesUrl]).toEqual([null, null]);
    expect(normalizeCodeqlDatabase({ id: 1, name: "db" }).commitOid).toBeNull();
    const org = normalizeOrgCodeScanningAlert({ number: 3, state: null, rule: { id: null }, repository: { full_name: "o/r" } });
    expect([org.state, org.ruleId, org.repository]).toEqual([null, null, "o/r"]);
    const adv = normalizeGlobalAdvisory({ ghsa_id: "GHSA-1", summary: "s", cve_id: null, description: null, withdrawn_at: null });
    expect([adv.cveId, adv.description, adv.withdrawnAt]).toEqual([null, null, null]);
    expect(adv.ghsaId).toBe("GHSA-1");
  });

  test("repos_reads: readme html_url / download_url (nullable), community description / documentation / updated_at (nullable)", () => {
    const r = normalizeReadme({ name: "README.md", path: "README.md", sha: "x", size: 1, encoding: "base64", content: "", html_url: null, download_url: null, type: "file" });
    expect([r.htmlUrl, r.downloadUrl]).toEqual([null, null]);
    const c = normalizeCommunityProfile({ health_percentage: 50, description: null, documentation: null, files: {}, updated_at: null });
    expect([c.description, c.documentation, c.updatedAt, c.healthPercentage]).toEqual([null, null, null, 50]);
  });

  test("deployment-status: environment / log_url / environment_url (optional), creator (nullable)", () => {
    const s = normalizeGitHubDeploymentStatus({ id: 1, state: "success", description: "", creator: null } as never);
    expect([s.environment, s.logUrl, s.environmentUrl, s.creator]).toEqual([null, null, null, null]);
    expect(s.state).toBe("success");
    expect(normalizeGitHubDeploymentStatus({ id: 1, state: "success", target_url: "legacy" } as never).logUrl).toBe("legacy");
  });

  test("workflow-run: run_attempt (optional) -> null, not a guessed 1", () => {
    expect(normalizeWorkflowRun({ id: 1 }).runAttempt).toBeNull();
    expect(normalizeWorkflowRun({ id: 1, run_attempt: 3 }).runAttempt).toBe(3);
  });
});

describe("TR-5b: widened output schemas admit the nulls", () => {
  const widened: Record<string, string[]> = {
    "code_scanning.alerts.get": ["alert.state"],
    "code_scanning.alerts.update": ["alert.state"],
    "code_scanning.analyses.list": ["analyses[].tool.name", "analyses[].tool.version", "analyses[].tool.guid"],
    "code_scanning.analyses.get": ["analysis.tool.name", "analysis.tool.version", "analysis.tool.guid"],
    "deployments.statuses.get": ["status.environment", "status.logUrl"],
    "orgs.teams.repos.permission.get": ["permission.roleName"],
    "orgs.teams.invitations.list": ["invitations[].login", "invitations[].email"],
    "code_scanning.sarifs.get": ["sarif.processingStatus", "sarif.analysesUrl"],
    "orgs.teams.get": ["team.description", "team.privacy"],
    "orgs.teams.child.list": ["teams[].description", "teams[].privacy"],
    "repos.teams.list": ["teams[].description", "teams[].privacy"],
    "user.teams.list": ["teams[].description", "teams[].privacy"],
    "orgs.organization_roles.teams.list": ["teams[].description", "teams[].privacy"],
  };
  for (const [op, paths] of Object.entries(widened)) {
    test(op, () => {
      for (const p of paths) expect(typeAt(op, p)).toContain("null");
    });
  }
});
