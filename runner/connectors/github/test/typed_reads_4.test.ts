import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { defaultConnectorRegistry } from "../../../bun/src/registry";
import { normalizeGitHubPullRequest, normalizeGitHubPullRequestSimple } from "../src/pull_requests";
import { normalizeGitHubRepoSearchItem, normalizeGitHubRepoStarredItem } from "../src/repos";
import { normalizeGitHubDeployment } from "../src/deployments";

// GH-TYPED-READS TR-4 (v0.86.9, +0 ops at 847).
// (a) PR headRepo is null when head.repo is null (deleted head fork; the pinned spec's webhook
//     pull_request schemas mark head.repo nullable) and repositoryUrl is null (not a property of
//     pull-request / pull-request-simple). pull-request-simple responses (commits.pulls.list,
//     requested_reviewers.add/remove, the pull_requests.list sync op) also get author null when user
//     is null (nullable-simple-user). baseRepo keeps its fallback: base.repo is required and non-null
//     in every pinned PR schema (linus: do not widen spec-required fields).
// (b) search.repositories (repo-search-result-item) and users/user.starred.list (repository) no
//     longer share the minimal-repository list normalizer: their spec-required fields are non-null
//     and declared non-null; only repository's nullable timestamps are nullable.
// Fixtures (fixtures/typed_reads_4/) are the pinned spec's documented examples, a deleted-fork
// variant (head.repo null), and sparse / required-only variants (only spec-required keys, nullable
// ones null). Outputs validate against a closed copy of the declared schema.

type Op = Record<string, any>;
const ops = manifest.operations as Record<string, Op>;
const ENVELOPE = new Set(["connector", "action", "source"]);
const fixture = (name: string) => require(`../fixtures/typed_reads_4/${name}.json`);
const OWNER = { owner: "octocat", repo: "Hello-World" };

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
  const calls: string[] = [];
  const fetch = (async (url: unknown, init?: { method?: string }) => {
    calls.push(`${init?.method ?? "GET"} ${new URL(String(url)).pathname}`);
    return Response.json(body, { status: key === "pull_requests.create" || key === "pull_requests.requested_reviewers.add" ? 201 : 200 });
  }) as unknown as typeof globalThis.fetch;
  const result = defaultConnectorRegistry.executeAction("github", key, { ...input, accessToken: "t", fetch });
  if (!result.ok) throw new Error(JSON.stringify(result));
  const output = (await Promise.resolve(result.output)) as Record<string, any>;
  return { output, calls };
}

// [op, input, first request, output key, pull-request-simple?, fixture variants]
const PR_OPS: [string, Record<string, unknown>, string, string, boolean, string[]][] = [
  ["pull_requests.get", { ...OWNER, pullNumber: 1347 }, "GET /repos/octocat/Hello-World/pulls/1347", "pullRequest", false, ["default", "deleted-fork"]],
  ["pull_requests.create", { ...OWNER, title: "Amazing new feature", head: "octocat:new-topic", base: "master" }, "POST /repos/octocat/Hello-World/pulls", "pullRequest", false, ["default", "deleted-fork"]],
  ["pull_requests.update", { ...OWNER, pullNumber: 1347, title: "new title" }, "PATCH /repos/octocat/Hello-World/pulls/1347", "pullRequest", false, ["default", "deleted-fork"]],
  ["pull_requests.requested_reviewers.add", { ...OWNER, pullNumber: 1347, reviewers: ["octocat"] }, "POST /repos/octocat/Hello-World/pulls/1347/requested_reviewers", "pullRequest", true, ["default", "sparse"]],
  ["pull_requests.requested_reviewers.remove", { ...OWNER, pullNumber: 1347, reviewers: ["octocat"] }, "DELETE /repos/octocat/Hello-World/pulls/1347/requested_reviewers", "pullRequest", true, ["default", "sparse"]],
  ["commits.pulls.list", { ...OWNER, commitSha: "6dcb09b5b57875f334f61aebed695e2e4193db5e" }, "GET /repos/octocat/Hello-World/commits/6dcb09b5b57875f334f61aebed695e2e4193db5e/pulls", "pullRequests", true, ["default", "sparse"]],
];
const prsOf = (output: Record<string, any>, key: string) => (Array.isArray(output[key]) ? output[key] : [output[key]]);
const bodiesOf = (body: any) => (Array.isArray(body) ? body : [body]);
const prSchema = (op: string) => {
  const p = ops[op]!.outputSchema.properties;
  return p.pullRequest ?? p.pullRequests.items;
};
const stripDescriptions = (s: any) => JSON.parse(JSON.stringify(s, (k, v) => (k === "description" ? undefined : v)));

describe("GH-TYPED-READS TR-4 (a): PR headRepo / repositoryUrl / author are null, never \"\"", () => {
  for (const [op, input, first, key, , variants] of PR_OPS) {
    for (const variant of variants) {
      test(`${op} (${variant}) validates against the closed declared schema; request unchanged`, async () => {
        const { output, calls } = await run(op, input, fixture(`${op}.${variant}`));
        expect(calls[0]).toBe(first);
        expect(prsOf(output, key).length).toBeGreaterThan(0);
        expect(strictErrors(op, output)).toEqual([]);
      });
    }
  }

  for (const [op, input, , key, simple, variants] of PR_OPS) {
    for (const variant of variants) {
      test(`${op} (${variant}): headRepo null iff head.repo is null; baseRepo, author and repositoryUrl follow the spec`, async () => {
        const body = fixture(`${op}.${variant}`);
        const { output } = await run(op, input, body);
        const prs = prsOf(output, key);
        const ups = bodiesOf(body);
        expect(prs).toHaveLength(ups.length);
        prs.forEach((pr: any, i: number) => {
          const up = ups[i];
          expect(pr.headRepo).toBe(up.head.repo === null ? null : up.head.repo.full_name);
          expect(pr.baseRepo).toBe(up.base.repo.full_name);
          expect(pr.repositoryUrl).toBeNull();
          if (up.user === null) {
            expect(simple, `${op}: only pull-request-simple has a nullable user`).toBe(true);
            expect(pr.author).toBeNull();
          } else expect(pr.author).toBe(up.user.login);
        });
      });
    }
  }

  test("every non-default fixture exercises the null path", async () => {
    for (const [op, input, , key, simple, variants] of PR_OPS) {
      const { output } = await run(op, input, fixture(`${op}.${variants[1]}`));
      for (const pr of prsOf(output, key)) {
        expect(pr.headRepo, op).toBeNull();
        if (simple) expect(pr.author, op).toBeNull();
      }
    }
  });

  test("declared PR schemas: headRepo and repositoryUrl nullable everywhere, baseRepo non-null, author nullable only for pull-request-simple", () => {
    const full = stripDescriptions(prSchema("pull_requests.get"));
    expect(full.properties.headRepo.type).toEqual(["string", "null"]);
    expect(full.properties.repositoryUrl.type).toEqual(["string", "null"]);
    expect(full.properties.baseRepo.type).toBe("string");
    expect(full.properties.author.type).toBe("string");
    for (const op of ["pull_requests.convert_to_draft", "pull_requests.mark_ready", "pull_requests.create", "pull_requests.update"]) {
      expect(stripDescriptions(prSchema(op)), op).toEqual(full);
    }
    const simple = structuredClone(full);
    simple.properties.author.type = ["string", "null"];
    for (const op of ["pull_requests.requested_reviewers.add", "pull_requests.requested_reviewers.remove", "commits.pulls.list"]) {
      expect(stripDescriptions(prSchema(op)), op).toEqual(simple);
    }
  });

  test("normalizers: full PR keeps the author fallback, simple PR gets null; head.repo absent is null too", () => {
    const base = { id: 1, number: 2, title: "t", head: { ref: "h", sha: "s" }, base: { ref: "main", sha: "s", repo: { full_name: "o/r" } } };
    expect(normalizeGitHubPullRequest(base).headRepo).toBeNull();
    expect(normalizeGitHubPullRequest(base).baseRepo).toBe("o/r");
    expect(normalizeGitHubPullRequest({ ...base, head: { ...base.head, repo: null as never } }).headRepo).toBeNull();
    expect(normalizeGitHubPullRequest({ ...base, head: { ...base.head, repo: { full_name: "f/r" } } }).headRepo).toBe("f/r");
    expect(normalizeGitHubPullRequest(base).author).toBe("");
    expect(normalizeGitHubPullRequestSimple(base).author).toBeNull();
    expect(normalizeGitHubPullRequestSimple({ ...base, user: { login: "u" } }).author).toBe("u");
    expect(normalizeGitHubPullRequest({ ...base, repository_url: "https://api.github.com/repos/o/r" }).repositoryUrl).toBe("https://api.github.com/repos/o/r");
  });
});

const REPO_OPS: [string, Record<string, unknown>, string, string, string][] = [
  ["search.repositories", { q: "tetris" }, "GET /search/repositories", "items", "default"],
  ["users.starred.list", { username: "octocat" }, "GET /users/octocat/starred", "repositories", "default-response"],
  ["user.starred.list", {}, "GET /user/starred", "repositories", "default-response"],
];
const REQUIRED_NON_NULL = ["cloneUrl", "sshUrl", "defaultBranch", "stars", "forks", "openIssues"];
const TIMESTAMPS = ["createdAt", "updatedAt", "pushedAt"];
const UPSTREAM: Record<string, string> = { cloneUrl: "clone_url", sshUrl: "ssh_url", defaultBranch: "default_branch", stars: "stargazers_count", forks: "forks_count", openIssues: "open_issues_count", createdAt: "created_at", updatedAt: "updated_at", pushedAt: "pushed_at" };

describe("GH-TYPED-READS TR-4 (b): search / starred repos keep spec-required fields non-null", () => {
  for (const [op, input, first, list, documented] of REPO_OPS) {
    for (const variant of [documented, "required-only"]) {
      test(`${op} (${variant}) validates against the closed declared schema; values follow upstream`, async () => {
        const body = fixture(`${op}.${variant}`);
        const { output, calls } = await run(op, input, body);
        expect(calls).toEqual([first]);
        expect(strictErrors(op, output)).toEqual([]);
        const ups: any[] = Array.isArray(body) ? body : body.items;
        expect(output[list]).toHaveLength(ups.length);
        output[list].forEach((item: any, i: number) => {
          for (const f of [...REQUIRED_NON_NULL, ...TIMESTAMPS]) expect(item[f], `${op} ${f}`).toBe(ups[i][UPSTREAM[f]]);
        });
      });
    }
  }

  test("search.repositories declares exactly the repos.get item: all nine fields non-null", () => {
    const item = ops["search.repositories"]!.outputSchema.properties.items.items;
    expect(item).toEqual(ops["repos.get"]!.outputSchema.properties.repo);
    for (const f of [...REQUIRED_NON_NULL, ...TIMESTAMPS]) expect(Array.isArray(item.properties[f].type), f).toBe(false);
  });

  test("starred lists declare the six required fields non-null and only the nullable timestamps nullable", () => {
    for (const op of ["users.starred.list", "user.starred.list"]) {
      const item = ops[op]!.outputSchema.properties.repositories.items;
      for (const f of REQUIRED_NON_NULL) expect(Array.isArray(item.properties[f].type), `${op} ${f}`).toBe(false);
      for (const f of TIMESTAMPS) expect(item.properties[f].type, `${op} ${f}`).toEqual(["string", "null"]);
      const expected = structuredClone(ops["repos.get"]!.outputSchema.properties.repo);
      for (const f of TIMESTAMPS) expected.properties[f].type = ["string", "null"];
      expect(item, op).toEqual(expected);
    }
  });

  test("required-only starred items: the nullable timestamps are null, the required fields keep values", async () => {
    const { output } = await run("user.starred.list", {}, fixture("user.starred.list.required-only"));
    for (const item of output.repositories) {
      for (const f of TIMESTAMPS) expect(item[f]).toBeNull();
      for (const f of REQUIRED_NON_NULL) expect(item[f]).not.toBeNull();
    }
  });

  test("a malformed item never yields null for a field declared non-null", () => {
    const search = normalizeGitHubRepoSearchItem({ id: 1 } as never);
    const starred = normalizeGitHubRepoStarredItem({ id: 1 } as never);
    for (const f of [...REQUIRED_NON_NULL, ...TIMESTAMPS]) expect((search as any)[f], `search ${f}`).not.toBeNull();
    for (const f of REQUIRED_NON_NULL) expect((starred as any)[f], `starred ${f}`).not.toBeNull();
    for (const f of TIMESTAMPS) expect((starred as any)[f], `starred ${f}`).toBeNull();
  });
});

describe("GH-TYPED-READS TR-4 sweep: deployment optional / nullable fields", () => {
  test("description, creator, transientEnvironment and productionEnvironment are null when absent or null", () => {
    const d = normalizeGitHubDeployment({ id: 1, sha: "s", ref: "main", task: "deploy", environment: "production", description: null, creator: null, created_at: "c", updated_at: "u" } as never);
    expect([d.description, d.creator, d.transientEnvironment, d.productionEnvironment]).toEqual([null, null, null, null]);
  });
  test("present values are kept", () => {
    const d = normalizeGitHubDeployment({ id: 1, description: "Deploy request from hubot", creator: { login: "octocat" }, transient_environment: false, production_environment: true } as never);
    expect([d.description, d.creator, d.transientEnvironment, d.productionEnvironment]).toEqual(["Deploy request from hubot", "octocat", false, true]);
  });
});
