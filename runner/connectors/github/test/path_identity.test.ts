import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import table from "../src/path_identity_fields.json";
import { defaultConnectorRegistry } from "../../../bun/src/registry";
import { isGitHubLogin, isGitHubRepoName, pathIdentityViolation } from "../src/path_identity";

// FIX-SEGMENT-2 (0.86.1): owner / org / username (+ assignee, targetUser, templateOwner) must
// be GitHub logins and repo (+ repoName, templateRepo) GitHub repository names, for every op
// whose request path carries them. Generated over all such ops through the registry with a
// recording fetch: each bad value fails with 0 fetches; valid values reach the URL unchanged.

type Seen = { method: string; url: string };
type Cls = "owner" | "org" | "user" | "repo";
const ops = manifest.operations as Record<string, any>;
const TABLE = table as Record<string, Record<string, Cls>>;

// Names that can carry a login or repository name in a REST path, with their class.
const CANDIDATES: Record<string, Cls> = {
  owner: "owner",
  templateOwner: "owner",
  org: "org",
  username: "user",
  assignee: "user",
  targetUser: "user",
  repo: "repo",
  repoName: "repo",
  templateRepo: "repo",
};
// Same-looking names that never reach a REST path (GraphQL variables / request bodies).
const NOT_PATH = new Set(["user", "enterprise", "organization", "login", "repository", "account", "target_user", "template_owner", "repo_name", "template_repo"]);

// Inputs that get past each handler's own checks so the op actually fetches (the generated
// required-only input is rejected by the handler for these).
const SHA = "a".repeat(40);
const OVERRIDES: Record<string, Record<string, unknown>> = {
  "pull_requests.requested_reviewers.add": { pullNumber: 1, reviewers: ["octocat"] },
  "pull_requests.requested_reviewers.remove": { pullNumber: 1, reviewers: ["octocat"] },
  "labels.update": { name: "bug", newName: "bug2" },
  "milestones.get": { milestoneNumber: 1 },
  "milestones.update": { milestoneNumber: 1, title: "t" },
  "discussions.get": { owner: "o", repo: "r", discussionNumber: 1 },
  "discussions.update": { owner: "o", repo: "r", discussionNumber: 1, title: "t" },
  "discussions.comments.list": { owner: "o", repo: "r", discussionNumber: 1 },
  "discussions.comments.create": { owner: "o", repo: "r", discussionNumber: 1, body: "b" },
  "discussions.comments.update": { owner: "o", repo: "r", discussionNumber: 1, commentId: "c", body: "b" },
  "git.trees.create": { tree: [{ path: "a", mode: "100644", type: "blob", content: "x" }] },
  "repos.update": { description: "d" },
  "deployments.get": { owner: "o", repo: "r", deploymentId: 1 },
  "environments.get": { owner: "o", repo: "r", name: "e" },
  "releases.assets.get": { owner: "o", repo: "r", assetId: 1 },
  "releases.assets.upload": { releaseId: 1, name: "a.txt", content: "x", contentType: "text/plain" },
  "git.tags.get": { sha: SHA },
  "repos.security_advisories.get": { ghsa_id: "GHSA-2c3f-4g5h-6j7m" },
  "repos.security_advisories.forks.create": { ghsa_id: "GHSA-2c3f-4g5h-6j7m" },
  "users.packages.versions.get": { packageType: "npm", packageName: "p", packageVersionId: 1 },
  "orgs.packages.list": { packageType: "npm" },
  "users.packages.list": { packageType: "npm" },
  "users.packages.versions.list": { packageType: "npm", packageName: "p" },
  "orgs.packages.versions.list": { packageType: "npm", packageName: "p" },
  "checks.suites.create": { headSha: SHA },
  "repos.pages.deployments.create": { artifactId: 1, pagesBuildVersion: SHA, oidcToken: "t" },
  "users.projects_v2.items.create": { username: "u", projectNumber: 1, owner: "o", repo: "r", number: 1, type: "Issue" },
  "orgs.properties.schema.update": { properties: [{ propertyName: "p", valueType: "string" }] },
  "orgs.properties.schema.create_or_update": { customPropertyName: "p", valueType: "string" },
  "orgs.properties.values.update": { repositoryNames: ["r"], properties: [{ propertyName: "p", value: "v" }] },
  "repos.properties.values.update": { properties: [{ propertyName: "p", value: "v" }] },
  "orgs.codespaces.secrets.create_or_update": { secretName: "S", encryptedValue: "e", keyId: "k", visibility: "all" },
  "orgs.dependabot.secrets.create_or_update": { secretName: "S", encryptedValue: "e", keyId: "k", visibility: "all" },
};

function recorder() {
  const seen: Seen[] = [];
  const fetch = (async (url: unknown, init?: RequestInit) => {
    seen.push({ method: init?.method ?? "GET", url: String(url) });
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { seen, fetch };
}

let counter = 0;
function gen(schema: any): any {
  if (!schema) return "x";
  if (schema.enum) return schema.enum[0];
  if (schema.const !== undefined) return schema.const;
  if (schema.oneOf || schema.anyOf) return gen((schema.oneOf || schema.anyOf)[0]);
  const t = Array.isArray(schema.type) ? schema.type.find((x: string) => x !== "null") : schema.type;
  if (t === "string") {
    if (schema.format === "date-time") return "2026-01-01T00:00:00Z";
    if (schema.format === "date") return "2026-01-01";
    if (schema.format === "uri" || schema.format === "url") return "https://example.com/x";
    if (schema.format === "email") return "a@example.com";
    if (schema.pattern) return null;
    return `zq${(counter++).toString(36)}x`;
  }
  if (t === "integer" || t === "number") {
    const v = Math.max(schema.minimum ?? 7, 7);
    return v <= (schema.maximum ?? 1e9) ? v : schema.minimum;
  }
  if (t === "boolean") return true;
  if (t === "array") {
    const item = gen(schema.items);
    return item === null ? [] : Array.from({ length: Math.max(1, schema.minItems ?? 1) }, () => item);
  }
  if (t === "object" || schema.properties) {
    const o: Record<string, unknown> = {};
    for (const k of schema.required ?? []) {
      const v = gen(schema.properties?.[k]);
      if (v !== null) o[k] = v;
    }
    return o;
  }
  return "x";
}

function baseInput(op: string): Record<string, unknown> {
  counter = 0;
  return { ...(gen(ops[op].inputSchema ?? { type: "object" }) as Record<string, unknown>), ...(OVERRIDES[op] ?? {}) };
}

async function call(op: string, input: Record<string, unknown>) {
  const r = recorder();
  let failed = false;
  let message = "";
  try {
    const result: any = defaultConnectorRegistry.executeAction("github", op, { ...input, accessToken: "tok", fetch: r.fetch });
    if (!result || result.ok === false) {
      failed = true;
      message = String(result?.message ?? "");
    } else await Promise.resolve(result.output);
  } catch (error: any) {
    failed = true;
    message = String(error?.message ?? error);
  }
  return { seen: r.seen, failed, message };
}

const LOGIN_BAD = ["a/b", "a".repeat(40), ".", "a.b", "a_b", "_ab", "a b", "a@b", "a:b", "é", "a%2Fb", "a?b", "a#b"];
const REPO_BAD = ["a/b", "a".repeat(101), ".", "..", "a b", "a@b", "a:b", "é", "a%2Fb", "a?b", "a#b", "a+b"];
const GOOD: Record<Cls, string[]> = {
  owner: ["a", "a-b-c", "A".repeat(39), "mona-cat_octo", "a--b", "a-", "-a"],
  org: ["a", "a-b-c", "Z".repeat(39), "a--b", "a-", "-a"],
  user: ["a", "a-b-c", "b".repeat(39), "mona-cat_octo", "dependabot[bot]", "a--b", "a-", "-a"],
  repo: ["a", "a.b-c_d", ".github", "-r", "r".repeat(100)],
};

describe("FIX-SEGMENT-2: GitHub login and repository-name path fields", () => {
  test("rules: login [A-Za-z0-9-]{1,39} (+ EMU suffix, + [bot] for user fields) and repo-name rule", () => {
    // Legacy forms (edge and doubled hyphens) are valid logins (linus, FIX-SEGMENT-2 amend).
    for (const v of ["octocat", "a", "a-b", "A1-b2-C3", "x".repeat(39), "a--b", "a-", "-a"]) for (const c of ["owner", "org", "user"] as const) expect(isGitHubLogin(v, c), v).toBe(true);
    for (const v of ["", "x".repeat(40), "a_b", "_ab", "ab_", "a.b", ".", "a/b", "a b", "é", "a@b"]) for (const c of ["owner", "org", "user"] as const) expect(isGitHubLogin(v, c), v).toBe(false);
    expect(isGitHubLogin("mona-cat_octo", "owner")).toBe(true);
    expect(isGitHubLogin("octo_admin", "user")).toBe(true);
    expect(isGitHubLogin("mona-cat_octo", "org")).toBe(false);
    expect(isGitHubLogin(`${"m".repeat(34)}_octo`, "owner")).toBe(true);
    expect(isGitHubLogin(`${"m".repeat(35)}_octo`, "owner")).toBe(false);
    expect(isGitHubLogin("dependabot[bot]", "user")).toBe(true);
    expect(isGitHubLogin("dependabot[bot]", "owner")).toBe(false);
    expect(isGitHubLogin("-x[bot]", "user")).toBe(true);
    expect(isGitHubLogin("x.y[bot]", "user")).toBe(false);
    expect(isGitHubLogin("mona_cat_octo", "owner")).toBe(false);
    for (const v of ["r", "a.b", "a-b_c.d", ".github", "...x", "r".repeat(100)]) expect(isGitHubRepoName(v), v).toBe(true);
    for (const v of ["", ".", "..", "a/b", "r".repeat(101), "a b", "a@b", "é"]) expect(isGitHubRepoName(v), v).toBe(false);
  });

  test("the op/field table matches sentinel discovery and the manifest routes", async () => {
    const discovered: Record<string, Record<string, Cls>> = {};
    const notPath: string[] = [];
    for (const [op, spec] of Object.entries(ops)) {
      if (spec.kind !== "action") continue;
      const props = Object.keys(spec.inputSchema?.properties ?? {});
      const input = baseInput(op);
      for (const field of props) {
        if (!(field in CANDIDATES) && !NOT_PATH.has(field)) continue;
        const sentinel = `zzsent${field.replace(/[^a-z]/gi, "")}zz`;
        const c = await call(op, { ...input, [field]: sentinel });
        expect(c.seen.length > 0, `${op}.${field}: ${c.message}`).toBe(true);
        if (c.seen.some((s) => new URL(s.url).pathname.includes(sentinel))) {
          expect(field in CANDIDATES, `${op}.${field} reaches the path but has no class`).toBe(true);
          (discovered[op] ??= {})[field] = CANDIDATES[field]!;
        } else if (field in CANDIDATES) notPath.push(`${op}.${field}`);
      }
    }
    expect(discovered).toEqual(TABLE);
    // GraphQL ops pass owner/repo as variables, body-only owners stay unvalidated (not a path).
    expect(notPath.sort()).toEqual([
      "discussions.categories.list.owner", "discussions.categories.list.repo",
      "discussions.comments.create.owner", "discussions.comments.create.repo",
      "discussions.comments.list.owner", "discussions.comments.list.repo",
      "discussions.comments.update.owner", "discussions.comments.update.repo",
      "discussions.create.owner", "discussions.create.repo",
      "discussions.get.owner", "discussions.get.repo",
      "discussions.list.owner", "discussions.list.repo",
      "discussions.update.owner", "discussions.update.repo",
      "graphql.repository.get.owner", "graphql.repository.get.repo",
      "repos.generate.owner",
      "users.projects_v2.items.create.owner", "users.projects_v2.items.create.repo",
    ]);
    // Manifest metadata: every route param of these kinds is in the table under its input name.
    const PARAM_TO_FIELD: Record<string, string[]> = {
      owner: ["owner"], repo: ["repo"], org: ["org"], username: ["username"], assignee: ["assignee"],
      target_user: ["targetUser"], template_owner: ["templateOwner"], template_repo: ["templateRepo"], repo_name: ["repoName"],
    };
    let routed = 0;
    for (const [op, spec] of Object.entries(ops)) {
      if (spec.kind !== "action") continue;
      const route: string | undefined = spec.request?.path ?? /\b(?:GET|POST|PUT|PATCH|DELETE)\s+(\/\S*)/.exec(String(spec.description ?? ""))?.[1];
      if (!route) continue;
      for (const [, param] of route.matchAll(/\{\{?([a-z_]+)\}?\}/g)) {
        const fields = PARAM_TO_FIELD[param!];
        if (!fields) continue;
        routed += 1;
        expect(fields.some((f) => TABLE[op]?.[f] !== undefined), `${op} {${param}}`).toBe(true);
      }
    }
    expect(routed).toBeGreaterThan(0);
  }, 300000);

  test("coverage: exact op and field counts", () => {
    const fields = Object.values(TABLE).flatMap((f) => Object.entries(f));
    expect(Object.keys(TABLE)).toHaveLength(626);
    expect(fields).toHaveLength(1081);
    const byClass: Record<string, number> = {};
    for (const [, c] of fields) byClass[c] = (byClass[c] ?? 0) + 1;
    expect(byClass).toEqual({ owner: 426, org: 155, user: 72, repo: 428 });
    for (const op of Object.keys(TABLE)) expect(ops[op]?.kind, op).toBe("action");
  });

  test("a/b, 40-char login, 101-char repo, '_' outside EMU and illegal characters: validation error, 0 fetches", async () => {
    const leaks: string[] = [];
    let cases = 0;
    for (const [op, fields] of Object.entries(TABLE)) {
      const input = baseInput(op);
      for (const [field, cls] of Object.entries(fields)) {
        for (const value of cls === "repo" ? REPO_BAD : LOGIN_BAD) {
          cases += 1;
          const c = await call(op, { ...input, [field]: value });
          if (c.seen.length > 0 || !c.failed) leaks.push(`${op}.${field}=${JSON.stringify(value)} -> ${c.seen[0]?.url ?? "no error"}`);
          else if (!c.message.includes(field)) leaks.push(`${op}.${field}=${JSON.stringify(value)} message: ${c.message}`);
        }
      }
    }
    expect(leaks).toEqual([]);
    expect(cases).toBe(13625); // 653 login fields x 13 + 428 repo fields x 12
  }, 600000);

  test("valid logins / repo names (39-char login, 100-char repo, EMU, [bot], legacy a--b / a- / -a) still reach GitHub unchanged", async () => {
    const rejected: string[] = [];
    for (const [op, fields] of Object.entries(TABLE)) {
      const input = baseInput(op);
      for (const [field, cls] of Object.entries(fields)) {
        for (const value of GOOD[cls]) {
          const c = await call(op, { ...input, [field]: value });
          const hit = c.seen.some((s) => s.url.includes(value) || s.url.includes(encodeURIComponent(value)));
          if (!hit) rejected.push(`${op}.${field}=${value} -> ${c.seen[0]?.url ?? c.message}`);
        }
      }
    }
    expect(rejected).toEqual([]);
  }, 600000);

  test("guard: absent / blank values are left to the handler and the FIX-SEGMENT-3 blank guard; non-strings are rejected", () => {
    expect(pathIdentityViolation("repos.get", { owner: "o", repo: "r" })).toBeNull();
    expect(pathIdentityViolation("repos.get", { owner: " ", repo: "r" })).toBeNull();
    expect(pathIdentityViolation("repos.get", { repo: "r" })).toBeNull();
    // FIX-SEGMENT-3: no trimming; " octocat " is not a login (and path_values rejects it first at dispatch).
    expect(String(pathIdentityViolation("user.blocks.check", { username: " octocat " }))).toContain("username must be a GitHub login");
    expect(String(pathIdentityViolation("user.blocks.check", { username: " octo cat " }))).toContain("username must be a GitHub login");
    expect(String(pathIdentityViolation("repos.get", { owner: 7, repo: "r" }))).toContain("owner must be a string");
    expect(String(pathIdentityViolation("repos.get", { owner: "a/b", repo: "r" }))).toContain("owner must be a GitHub login");
    expect(String(pathIdentityViolation("repos.get", { owner: "o", repo: "a/b" }))).toContain("repo must be a GitHub repository name");
    expect(pathIdentityViolation("graphql.repository.get", { owner: "a/b", repo: "r" })).toBeNull();
  });
});
