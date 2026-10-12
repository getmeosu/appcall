import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { normalizeRunner, normalizeRunnerLabel } from "../src/card10_reads";
import { normalizeDownload } from "../src/card11_reads";
import { normalizeIssueType, normalizeOrgSecret, normalizeSelectedActions } from "../src/gap_g3";
import { normalizeCustomPropertySchema } from "../src/gap_g7";
import { normalizeDevcontainer, normalizeOrgCodespaceSecret } from "../src/gap_g8";
import { normalizeAttestation } from "../src/gap_g9";
import { normalizeGitHubBranchRule } from "../src/governance";
import {
  normalizeContributor,
  normalizeRepoActivity,
  normalizeRepoEvent,
  normalizeRepoLicense,
  normalizeSecurityAdvisory,
} from "../src/repos_reads";

// TR-5d (v0.89.5, +0 ops): exact-schema nullability against pinned spec rest-api-description 58b1e0c0,
// continued. Optional or nullable fields come back null (booleans included: an absent optional flag is
// null, not a guessed false). Spec-required non-nullable fields keep their fallback. Every assertion
// below fails on v0.89.4 (TR-5c 84001b6d).

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

describe("TR-5d: sparse upstream objects normalize to null, not fabricated values", () => {
  test("card10 runner: ephemeral (optional), version (nullable); runner-label id / type (optional)", () => {
    const r = normalizeRunner({ id: 1, name: "r", os: "linux", status: "online", busy: false, version: null, labels: [{ name: "self-hosted" }] });
    expect([r.ephemeral, r.version]).toEqual([null, null]);
    expect([r.name, r.busy]).toEqual(["r", false]);
    expect(normalizeRunner({ id: 1, ephemeral: false }).ephemeral).toBe(false);
    const l = normalizeRunnerLabel({ name: "self-hosted" });
    expect([l.id, l.type, l.name]).toEqual([null, null, "self-hosted"]);
  });

  test("card11 runner-application: sha256_checksum (optional)", () => {
    expect(normalizeDownload({ os: "linux", architecture: "x64", download_url: "u", filename: "f" }).sha256_checksum).toBeNull();
  });

  test("gap_g3: selected-actions flags, org secret selected_repositories_url, issue-type fields", () => {
    const s = normalizeSelectedActions({ patterns_allowed: ["a/*"] });
    expect([s.githubOwnedAllowed, s.verifiedAllowed]).toEqual([null, null]);
    expect(normalizeSelectedActions({ github_owned_allowed: false }).githubOwnedAllowed).toBe(false);
    expect(normalizeOrgSecret({ name: "S", created_at: "t", updated_at: "t", visibility: "all" }).selectedRepositoriesUrl).toBeNull();
    const t = normalizeIssueType({ id: 1, node_id: "n", name: "Bug", description: null, color: null });
    expect([t.description, t.color, t.createdAt, t.updatedAt, t.isEnabled]).toEqual([null, null, null, null, null]);
    expect(t.name).toBe("Bug");
  });

  test("gap_g7: custom-property required / description / values_editable_by / require_explicit_values", () => {
    const c = normalizeCustomPropertySchema({ property_name: "p", value_type: "string", description: null, values_editable_by: null });
    expect([c.required, c.description, c.valuesEditableBy, c.requireExplicitValues]).toEqual([null, null, null, null]);
    expect(c.propertyName).toBe("p");
  });

  test("gap_g8: devcontainer name / display_name (optional), org codespace secret selected_repositories_url", () => {
    const d = normalizeDevcontainer({ path: ".devcontainer/devcontainer.json" });
    expect([d.path, d.name, d.displayName]).toEqual([".devcontainer/devcontainer.json", null, null]);
    expect(normalizeOrgCodespaceSecret({ name: "S", visibility: "all" }).selectedRepositoriesUrl).toBeNull();
  });

  test("gap_g9: attestation repository_id / bundle_url (optional)", () => {
    const a = normalizeAttestation({ bundle: {} });
    expect([a.repositoryId, a.bundleUrl]).toEqual([null, null]);
  });

  test("governance branch rule: ruleset_id / ruleset_source_type / ruleset_source (optional)", () => {
    const b = normalizeGitHubBranchRule({ type: "deletion" } as never);
    expect([b.rulesetId, b.rulesetSourceType, b.rulesetSource]).toEqual([null, null, null]);
    expect(b.type).toBe("deletion");
  });

  test("repos_reads: advisory, license html_url, repo event, activity actor, contributor login / id", () => {
    const a = normalizeSecurityAdvisory({ ghsa_id: "GHSA-1", summary: "s", state: "draft", html_url: "h", description: null, severity: null, published_at: null, updated_at: null });
    expect([a.description, a.severity, a.publishedAt, a.updatedAt]).toEqual([null, null, null, null]);
    expect([a.ghsaId, a.state]).toEqual(["GHSA-1", "draft"]);
    expect(normalizeRepoLicense({ name: "LICENSE", html_url: null, license: {} }).htmlUrl).toBeNull();
    const e = normalizeRepoEvent({ id: "1", type: null, actor: { login: "a" }, repo: { name: "o/r" }, created_at: null });
    expect([e.type, e.createdAt, e.actor]).toEqual([null, null, "a"]);
    expect(normalizeRepoActivity({ id: 1, ref: "refs/heads/main", timestamp: "t", activity_type: "push", actor: null }).actor).toBeNull();
    const c = normalizeContributor({ contributions: 5, type: "Anonymous" });
    expect([c.login, c.id, c.contributions]).toEqual([null, null, 5]);
  });
});

describe("TR-5d: widened output schemas admit the nulls", () => {
  const widened: Record<string, string[]> = {
    "orgs.actions.runners.get": ["runner.ephemeral", "runner.version"],
    "repos.actions.runners.get": ["runner.ephemeral", "runner.version"],
    "repos.actions.runners.labels.list": ["labels[].id", "labels[].type"],
    "orgs.actions.runners.downloads.list": ["downloads[].sha256_checksum"],
    "repos.actions.runners.downloads.list": ["downloads[].sha256_checksum"],
    "orgs.actions.permissions.selected_actions.get": ["selectedActions.githubOwnedAllowed", "selectedActions.verifiedAllowed"],
  };
  for (const [op, paths] of Object.entries(widened)) {
    test(op, () => {
      for (const p of paths) expect(typeAt(op, p)).toContain("null");
    });
  }
});
