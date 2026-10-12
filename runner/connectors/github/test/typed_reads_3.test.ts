import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { defaultConnectorRegistry } from "../../../bun/src/registry";
import { normalizeGitHubPullRequest } from "../src/pull_requests";

// GH-TYPED-READS TR-3 (v0.86.8, +0 ops at 847). List items get null for spec-optional fields instead
// of the full-object fallbacks ("main", 0, ""). The repo, user and org list normalizers
// (normalizeGitHub{Repo,User,Org}ListItem) serve every list read that returns those items (28 ops);
// user.blocks.list and repos.collaborators.list (own normalizers) and commits.pulls.list
// (pull-request-simple items) are typed too. Fixtures (fixtures/typed_reads_3/) are
// GitHub's documented 200 examples from the pinned spec (<op>.<example>.json) plus a sparse variant
// (<op>.sparse.json: list items with only spec-required keys, nullable ones null). Outputs validate
// against a closed copy of the declared schema, so undeclared and declared-but-missing fields fail.

type Op = Record<string, any>;
const ops = manifest.operations as Record<string, Op>;
const ENVELOPE = new Set(["connector", "action", "source"]);
const fixture = (name: string) => require(`../fixtures/typed_reads_3/${name}.json`);

// repo/user/org use normalizeGitHub{Repo,User,Org}ListItem; blocked (user.blocks.list) and collab
// (repos.collaborators.list) have their own simple-user / collaborator normalizers.
// TR-4 (linus: do not widen spec-required fields): search.repositories (repo-search-result-item) and
// users/user.starred.list (repository) left the minimal-repository set for their own normalizers.
type Entity = "repo" | "repoSearch" | "repoStarred" | "user" | "org" | "pr" | "blocked" | "collab";
// [op, input, request pathname, list key, item entity, fixture variants]
export const TR3_LISTS: [string, Record<string, unknown>, string, string, Entity, string[]][] = [
  ["search.users", {"q": "octo"}, "/search/users", "items", "user", ["default", "sparse"]],
  ["search.repositories", {"q": "octo"}, "/search/repositories", "items", "repoSearch", ["default", "sparse"]],
  ["search.orgs", {"q": "octo"}, "/search/users", "items", "org", ["default", "sparse"]],
  ["user.blocks.list", {}, "/user/blocks", "users", "blocked", ["default", "sparse"]],
  ["users.repos.list", {"username": "octocat"}, "/users/octocat/repos", "repositories", "repo", ["default", "sparse"]],
  ["orgs.list", {}, "/user/orgs", "organizations", "org", ["default", "sparse"]],
  ["orgs.members.list", {"org": "github"}, "/orgs/github/members", "members", "user", ["default", "sparse"]],
  ["orgs.repos.list", {"org": "github"}, "/orgs/github/repos", "repositories", "repo", ["default", "sparse"]],
  ["repos.collaborators.list", {"owner": "octocat", "repo": "Hello-World"}, "/repos/octocat/Hello-World/collaborators", "collaborators", "collab", ["default", "sparse"]],
  ["teams.members.list", {"org": "github", "teamSlug": "justice-league"}, "/orgs/github/teams/justice-league/members", "members", "user", ["default", "sparse"]],
  ["repos.forks.list", {"owner": "octocat", "repo": "Hello-World"}, "/repos/octocat/Hello-World/forks", "forks", "repo", ["default", "sparse"]],
  ["teams.repos.list", {"org": "github", "teamSlug": "justice-league"}, "/orgs/github/teams/justice-league/repos", "repositories", "repo", ["default", "sparse"]],
  ["users.list", {}, "/users", "users", "user", ["default", "sparse"]],
  ["users.starred.list", {"username": "octocat"}, "/users/octocat/starred", "repositories", "repoStarred", ["default-response", "sparse"]],
  ["user.starred.list", {}, "/user/starred", "repositories", "repoStarred", ["default-response", "sparse"]],
  ["orgs.public.list", {}, "/organizations", "organizations", "org", ["default", "sparse"]],
  ["users.orgs.list", {"username": "octocat"}, "/users/octocat/orgs", "organizations", "org", ["default", "sparse"]],
  ["orgs.outside_collaborators.list", {"org": "github"}, "/orgs/github/outside_collaborators", "collaborators", "user", ["default", "sparse"]],
  ["orgs.public_members.list", {"org": "github"}, "/orgs/github/public_members", "members", "user", ["default", "sparse"]],
  ["orgs.blocks.list", {"org": "github"}, "/orgs/github/blocks", "users", "user", ["default", "sparse"]],
  ["branches.protection.restrictions.get", {"owner": "octocat", "repo": "Hello-World", "branch": "main"}, "/repos/octocat/Hello-World/branches/main/protection/restrictions", "users", "user", ["default", "sparse"]],
  ["branches.protection.restrictions.users.list", {"owner": "octocat", "repo": "Hello-World", "branch": "main"}, "/repos/octocat/Hello-World/branches/main/protection/restrictions/users", "users", "user", ["default", "sparse"]],
  ["users.followers.list", {"username": "octocat"}, "/users/octocat/followers", "users", "user", ["default", "sparse"]],
  ["user.followers.list", {}, "/user/followers", "users", "user", ["default", "sparse"]],
  ["users.subscriptions.list", {"username": "octocat"}, "/users/octocat/subscriptions", "repositories", "repo", ["default", "sparse"]],
  ["user.subscriptions.list", {}, "/user/subscriptions", "repositories", "repo", ["default", "sparse"]],
  ["repos.stargazers.list", {"owner": "octocat", "repo": "Hello-World"}, "/repos/octocat/Hello-World/stargazers", "users", "user", ["default-response", "sparse"]],
  ["users.following.list", {"username": "octocat"}, "/users/octocat/following", "users", "user", ["default", "sparse"]],
  ["user.following.list", {}, "/user/following", "users", "user", ["default", "sparse"]],
  ["repos.subscribers.list", {"owner": "octocat", "repo": "Hello-World"}, "/repos/octocat/Hello-World/subscribers", "users", "user", ["default", "sparse"]],
  ["commits.pulls.list", {"owner": "octocat", "repo": "Hello-World", "commitSha": "6dcb09b5b57875f334f61aebed695e2e4193db5e"}, "/repos/octocat/Hello-World/commits/6dcb09b5b57875f334f61aebed695e2e4193db5e/pulls", "pullRequests", "pr", ["default", "sparse"]]
];

/** Strict check: type (incl. nullable unions), enum, declared properties present (or only those in `required` when the schema lists it), and nothing undeclared where additionalProperties is false. */
function schemaErrors(value: unknown, schema: any, path = "$"): string[] {
  if (!schema || typeof schema !== "object") return [];
  const types: string[] | null = schema.type === undefined ? null : Array.isArray(schema.type) ? schema.type : [schema.type];
  const kind = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  if (types) {
    const ok = types.some((t) => t === kind || (t === "integer" && typeof value === "number" && Number.isInteger(value)));
    if (!ok) return [`${path}: ${kind} is not ${types.join("|")}`];
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) return [`${path}: not in enum`];
  const errors: string[] = [];
  if (kind === "object" && schema.properties) {
    const required: string[] = Array.isArray(schema.required) ? schema.required : Object.keys(schema.properties);
    for (const [key, sub] of Object.entries(schema.properties)) {
      const v = (value as Record<string, unknown>)[key];
      if (v === undefined) { if (required.includes(key)) errors.push(`${path}.${key}: missing`); }
      else errors.push(...schemaErrors(v, sub, `${path}.${key}`));
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value as Record<string, unknown>)) if (!(key in schema.properties)) errors.push(`${path}.${key}: not declared`);
    }
  }
  if (kind === "array" && schema.items) (value as unknown[]).forEach((v, i) => errors.push(...schemaErrors(v, schema.items, `${path}[${i}]`)));
  return errors;
}

/** Closed copy: additionalProperties:false on every object that declares properties, except raw (passthrough). */
function closed(schema: any): any {
  const copy = structuredClone(schema);
  const walk = (s: any) => {
    if (!s || typeof s !== "object") return;
    if (s.properties) {
      s.additionalProperties = false;
      for (const sub of Object.values(s.properties)) walk(sub);
    }
    if (s.items) walk(s.items);
  };
  walk(copy);
  return copy;
}

function strictErrors(key: string, output: Record<string, unknown>): string[] {
  const schema = ops[key]!.outputSchema;
  const { connector: _c, action: _a, source: _s, ...payload } = output;
  const errors = schemaErrors(payload, closed(schema));
  for (const k of Object.keys(output)) if (!ENVELOPE.has(k) && !(k in schema.properties)) errors.push(`$.${k}: not declared (top level)`);
  return errors;
}

async function run(key: string, input: Record<string, unknown>, body: unknown) {
  const calls: URL[] = [];
  const fetch = (async (url: unknown) => {
    calls.push(new URL(String(url)));
    return Response.json(body);
  }) as unknown as typeof globalThis.fetch;
  const result = defaultConnectorRegistry.executeAction("github", key, { ...input, accessToken: "t", fetch });
  if (!result.ok) throw new Error(JSON.stringify(result));
  const output = (await Promise.resolve(result.output)) as Record<string, any>;
  return { output, calls };
}

// Normalized field -> upstream key, for the fields that are optional (or absent) in a list item
// schema. Null exactly when the upstream key is missing or null; otherwise the upstream value.
const LIST_NULLS: Partial<Record<Entity, Record<string, string>>> = {
  repo: { cloneUrl: "clone_url", sshUrl: "ssh_url", defaultBranch: "default_branch", stars: "stargazers_count", forks: "forks_count", openIssues: "open_issues_count", createdAt: "created_at", updatedAt: "updated_at", pushedAt: "pushed_at" },
  user: { publicRepos: "public_repos", followers: "followers", following: "following", createdAt: "created_at", updatedAt: "updated_at" },
  org: { publicRepos: "public_repos", createdAt: "created_at", updatedAt: "updated_at" },
  repoStarred: { createdAt: "created_at", updatedAt: "updated_at", pushedAt: "pushed_at" },
  collab: { permissions: "permissions" },
};
const ITEM_OF: Partial<Record<Entity, () => any>> = {
  repo: () => ops["repos.get"]!.outputSchema.properties.repo,
  repoSearch: () => ops["repos.get"]!.outputSchema.properties.repo,
  repoStarred: () => ops["repos.get"]!.outputSchema.properties.repo,
  user: () => ops["users.get"]!.outputSchema.properties.user,
  org: () => ops["orgs.get"]!.outputSchema.properties.organization,
  pr: () => ops["pull_requests.get"]!.outputSchema.properties.pullRequest,
};

describe("GH-TYPED-READS TR-3: list items declare their full output", () => {
  test("the TR-3 set is exactly 31 list reads (28 repo/user/org list-normalizer reads, 2 own-normalizer user lists, commits.pulls.list)", () => {
    expect(TR3_LISTS).toHaveLength(31);
    expect(new Set(TR3_LISTS.map(([k]) => k)).size).toBe(31);
    expect(TR3_LISTS.filter(([, , , , e]) => ["repo", "repoSearch", "repoStarred", "user", "org"].includes(e))).toHaveLength(28);
    for (const [key] of TR3_LISTS) {
      expect(ops[key]!.kind, key).toBe("action");
      expect(ops[key]!.sideEffect, key).toBe("read");
    }
  });

  for (const [key, input, pathname, list, , variants] of TR3_LISTS) {
    for (const variant of variants) {
      test(`${key} (${variant}) validates against the closed declared schema`, async () => {
        const { output, calls } = await run(key, input, fixture(`${key}.${variant}`));
        expect(calls.map((u) => u.pathname)).toEqual([pathname]);
        expect(output[list].length, key).toBeGreaterThan(0);
        expect(strictErrors(key, output)).toEqual([]);
      });
    }
  }

  test("list item schemas: same as the typed get object, with the list-optional fields nullable", () => {
    for (const [key, , , list, entity] of TR3_LISTS) {
      if (!ITEM_OF[entity]) continue; // blocked / collab: own normalizer, own schema
      const item = ops[key]!.outputSchema.properties[list].items;
      const base = structuredClone(ITEM_OF[entity]!());
      // TR-4: commits.pulls.list returns pull-request-simple, whose user is nullable.
      const widen = entity === "pr" ? ["author"] : Object.keys(LIST_NULLS[entity] ?? {});
      {
        for (const f of widen) {
          const t = base.properties[f].type;
          base.properties[f].type = [Array.isArray(t) ? t[0] : t, "null"];
        }
      }
      expect(item, key).toEqual(base);
    }
  });
});

describe("GH-TYPED-READS TR-3: list-optional fields are null, never \"main\", 0 or \"\"", () => {
  for (const [key, input, , list, entity, variants] of TR3_LISTS) {
    const fields = LIST_NULLS[entity];
    if (!fields) continue;
    for (const variant of variants) {
      test(`${key} (${variant}): ${Object.keys(fields).join(", ")} are null iff the upstream item omits them`, async () => {
        const body = fixture(`${key}.${variant}`);
        const { output } = await run(key, input, body);
        const upstream: any[] = Array.isArray(body) ? body : body.items ?? body.users;
        expect(output[list]).toHaveLength(upstream.length);
        output[list].forEach((item: any, i: number) => {
          for (const [f, src] of Object.entries(fields)) {
            const v = upstream[i][src];
            if (v === undefined || v === null) expect(item[f], `${key} ${f}`).toBeNull();
            else if (f !== "permissions") expect(item[f], `${key} ${f}`).toBe(v);
            else expect(item[f], `${key} ${f}`).not.toBeNull();
          }
        });
      });
    }
  }
  test("sparse list items exercise the null path for every list-optional field of each normalizer", async () => {
    const sparseNulls = async (key: string, input: Record<string, unknown>, list: string, fields: string[]) => {
      const { output } = await run(key, input, fixture(`${key}.sparse`));
      for (const f of fields) expect(output[list][0][f], `${key} ${f}`).toBeNull();
    };
    await sparseNulls("users.repos.list", { username: "octocat" }, "repositories", Object.keys(LIST_NULLS.repo!));
    await sparseNulls("users.list", {}, "users", Object.keys(LIST_NULLS.user!));
    await sparseNulls("orgs.public.list", {}, "organizations", Object.keys(LIST_NULLS.org!));
    await sparseNulls("repos.collaborators.list", { owner: "octocat", repo: "Hello-World" }, "collaborators", ["permissions"]);
  });
  test("present values are unchanged (documented examples keep their counts, branch and timestamps)", async () => {
    const { output } = await run("users.repos.list", { username: "octocat" }, fixture("users.repos.list.default"));
    const raw = fixture("users.repos.list.default")[0];
    expect(output.repositories[0]).toMatchObject({ defaultBranch: raw.default_branch, stars: raw.stargazers_count, forks: raw.forks_count, createdAt: raw.created_at, cloneUrl: raw.clone_url });
  });
  test("the get normalizers keep their spec-required fallbacks (only list items changed)", async () => {
    const { output } = await run("repos.get", { owner: "octocat", repo: "Hello-World" }, { id: 1, name: "n", full_name: "o/n" });
    expect(output.repo).toMatchObject({ defaultBranch: "main", stars: 0, cloneUrl: "" });
  });
  test("pull-request-simple has no `merged`: isMerged follows merged_at (a merged PR was isMerged:false)", () => {
    const base = { id: 1, number: 1, title: "t", head: {}, base: {} } as any;
    expect(normalizeGitHubPullRequest({ ...base, merged_at: "2026-01-01T00:00:00Z" }).isMerged).toBe(true);
    expect(normalizeGitHubPullRequest({ ...base, merged_at: null }).isMerged).toBe(false);
    expect(normalizeGitHubPullRequest({ ...base, merged: false, merged_at: "2026-01-01T00:00:00Z" }).isMerged).toBe(false);
  });
});
