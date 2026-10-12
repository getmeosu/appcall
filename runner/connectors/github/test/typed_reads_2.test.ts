import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { defaultConnectorRegistry } from "../../../bun/src/registry";
import { normalizeGitHubIssue } from "../src/issues";

// GH-TYPED-READS TR-2 (v0.86.7, +0 ops at 847). The top-traffic read actions (not sync ops) declare
// their full normalized output. Fixtures (fixtures/typed_reads_2/) are GitHub's documented 200
// examples from the pinned github/rest-api-description spec (<op>.<example>.json) plus a sparse
// variant (<op>.sparse.json: only spec-required keys, nullable ones null). Outputs validate against
// a closed copy of the schema (additionalProperties:false on every declared object), so undeclared
// and declared-but-missing fields both fail. Only repos.contents.get is a passthrough of GitHub's
// variant body; it declares `required` for the keys every variant has and lists variant-only keys.

type Op = Record<string, any>;
const ops = manifest.operations as Record<string, Op>;
const ENVELOPE = new Set(["connector", "action", "source"]);
const fixture = (name: string) => require(`../fixtures/typed_reads_2/${name}.json`);

export const TR2_TYPED = [
  "repos.get", "issues.get", "users.get", "users.get_authenticated", "users.get_by_username", "users.get_by_id",
  "orgs.get", "commits.get", "branches.get", "repos.contents.get", "releases.get_latest", "releases.get_by_tag",
  "issues.comments.list",
] as const;

const O = { owner: "octocat", repo: "Hello-World" };
const INPUT: Record<(typeof TR2_TYPED)[number], Record<string, unknown>> = {
  "repos.get": O, "issues.get": { ...O, issueNumber: 1347 }, "users.get": {}, "users.get_authenticated": {},
  "users.get_by_username": { username: "octocat" }, "users.get_by_id": { accountId: 1 }, "orgs.get": { org: "github" },
  "commits.get": { ...O, ref: "6dcb09b5b57875f334f61aebed695e2e4193db5e" }, "branches.get": { ...O, branch: "main" },
  "repos.contents.get": { ...O, path: "README.md" }, "releases.get_latest": O, "releases.get_by_tag": { ...O, tag: "v1.0.0" },
  "issues.comments.list": { ...O, issueNumber: 1347 },
};
const DOCUMENTED: Record<(typeof TR2_TYPED)[number], string[]> = {
  "repos.get": ["default-response"], "issues.get": ["default", "pinned_comment"],
  "users.get": ["response-with-public-and-private-profile-information", "response-with-public-profile-information"],
  "users.get_authenticated": ["response-with-public-and-private-profile-information", "response-with-public-profile-information"],
  "users.get_by_username": ["default-response", "response-with-git-hub-plan-information"],
  "users.get_by_id": ["default-response", "response-with-git-hub-plan-information"],
  "orgs.get": ["default-response"], "commits.get": ["default"], "branches.get": ["default"],
  "repos.contents.get": ["response-if-content-is-a-file", "response-if-content-is-a-directory", "response-if-content-is-a-symlink", "response-if-content-is-a-submodule"],
  "releases.get_latest": ["default"], "releases.get_by_tag": ["default"], "issues.comments.list": ["default"],
};
const ROUTE: Record<(typeof TR2_TYPED)[number], string> = {
  "repos.get": "GET https://api.github.com/repos/octocat/Hello-World",
  "issues.get": "GET https://api.github.com/repos/octocat/Hello-World/issues/1347",
  "users.get": "GET https://api.github.com/user",
  "users.get_authenticated": "GET https://api.github.com/user",
  "users.get_by_username": "GET https://api.github.com/users/octocat",
  "users.get_by_id": "GET https://api.github.com/user/1",
  "orgs.get": "GET https://api.github.com/orgs/github",
  "commits.get": "GET https://api.github.com/repos/octocat/Hello-World/commits/6dcb09b5b57875f334f61aebed695e2e4193db5e",
  "branches.get": "GET https://api.github.com/repos/octocat/Hello-World/branches/main",
  "repos.contents.get": "GET https://api.github.com/repos/octocat/Hello-World/contents/README.md",
  "releases.get_latest": "GET https://api.github.com/repos/octocat/Hello-World/releases/latest",
  "releases.get_by_tag": "GET https://api.github.com/repos/octocat/Hello-World/releases/tags/v1.0.0",
  "issues.comments.list": "GET https://api.github.com/repos/octocat/Hello-World/issues/1347/comments",
};

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

async function run(key: string, input: Record<string, unknown>, body: unknown, status = 200) {
  const calls: string[] = [];
  const fetch = (async (url: unknown, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    return Response.json(body, { status });
  }) as unknown as typeof globalThis.fetch;
  const result = defaultConnectorRegistry.executeAction("github", key, { ...input, accessToken: "t", fetch });
  if (!result.ok) throw new Error(JSON.stringify(result));
  const output = (await Promise.resolve(result.output)) as Record<string, any>;
  return { output, calls };
}

describe("GH-TYPED-READS TR-2: top-traffic reads declare their full output", () => {
  test("the TR-2 set is exactly 13 read actions, none of them sync ops", () => {
    expect(TR2_TYPED).toHaveLength(13);
    expect(new Set(TR2_TYPED).size).toBe(13);
    for (const key of TR2_TYPED) {
      expect(ops[key]!.kind, key).toBe("action");
      expect(ops[key]!.sideEffect, key).toBe("read");
    }
  });

  for (const key of TR2_TYPED) {
    for (const variant of [...DOCUMENTED[key], "sparse", ...(key === "repos.contents.get" ? ["directory.sparse"] : [])]) {
      test(`${key} (${variant}) validates against the closed declared schema`, async () => {
        const { output, calls } = await run(key, INPUT[key], fixture(`${key}.${variant}`));
        expect(calls).toEqual([ROUTE[key]]);
        expect(strictErrors(key, output)).toEqual([]);
      });
    }
  }

  test("the same normalizer gives the same declared schema (users.*, releases.*, issues.comments.*)", () => {
    for (const k of ["users.get_authenticated", "users.get_by_username", "users.get_by_id"]) expect(ops[k]!.outputSchema, k).toEqual(ops["users.get"]!.outputSchema);
    for (const k of ["releases.get_latest", "releases.get_by_tag"]) expect(ops[k]!.outputSchema, k).toEqual(ops["releases.get"]!.outputSchema);
    expect(ops["issues.comments.list"]!.outputSchema.properties.comments.items).toEqual(ops["issues.comments.get"]!.outputSchema.properties.comment);
  });
});

describe("GH-TYPED-READS TR-2: spec-optional or nullable fields are null, never fabricated", () => {
  const nulls = async (key: (typeof TR2_TYPED)[number], path: string, fields: string[]) => {
    const { output } = await run(key, INPUT[key], fixture(`${key}.sparse`));
    let obj: any = output;
    for (const p of path.split(".")) obj = p === "0" ? obj[0] : obj[p];
    for (const f of fields) expect(obj[f], `${key} ${f}`).toBeNull();
  };
  test("repos.get: description, language, visibility", () => nulls("repos.get", "repo", ["description", "language", "visibility"]));
  test("issues.get: body, author, assignee, closedAt", () => nulls("issues.get", "issue", ["body", "author", "assignee", "closedAt"]));
  for (const key of ["users.get", "users.get_authenticated", "users.get_by_username", "users.get_by_id"] as const) {
    test(`${key}: name, email, bio, company, location, blog`, () => nulls(key, "user", ["name", "email", "bio", "company", "location", "blog"]));
  }
  test("orgs.get: name, description, company, blog, location, email", () => nulls("orgs.get", "organization", ["name", "description", "company", "blog", "location", "email"]));
  test("commits.get: author, authorEmail, committer, committerEmail, authoredAt, committedAt", () =>
    nulls("commits.get", "commit", ["author", "authorEmail", "committer", "committerEmail", "authoredAt", "committedAt"]));
  test("releases.get_latest / get_by_tag: name, body, tarballUrl, zipballUrl, publishedAt", async () => {
    await nulls("releases.get_latest", "release", ["name", "body", "tarballUrl", "zipballUrl", "publishedAt"]); // target_commitish is spec-required
    await nulls("releases.get_by_tag", "release", ["name", "body", "tarballUrl", "zipballUrl", "publishedAt"]);
  });
  test("issues.comments.list: body, author", () => nulls("issues.comments.list", "comments.0", ["body", "author"]));
  test("repos.contents.get: git_url, html_url, download_url pass through as null", () => nulls("repos.contents.get", "contents", ["git_url", "html_url", "download_url"]));
  test("commits.get author falls back to the GitHub login when the git author name is missing (real data, not invented)", async () => {
    const body = { ...fixture("commits.get.sparse"), author: { login: "octocat" } };
    const { output } = await run("commits.get", INPUT["commits.get"], body);
    expect(output.commit.author).toBe("octocat");
  });
  test("issue labels: plain-string labels keep their name (were \"\"); unnamed label objects are dropped (were \"\")", () => {
    const issue = normalizeGitHubIssue({ id: 1, number: 1, title: "t", labels: ["bug", { name: "ui" }, { color: "fff" }] as any });
    expect(issue.labels).toEqual(["bug", "ui"]);
  });
  test("branches.get not found: found false, branch null, name echoed; validates", async () => {
    const { output } = await run("branches.get", INPUT["branches.get"], { message: "Branch not found" }, 404);
    expect(output).toMatchObject({ found: false, branch: null, name: "main" });
    expect(strictErrors("branches.get", output)).toEqual([]);
  });
});

describe("GH-TYPED-READS TR-2: siblings sharing a normalizer are widened consistently", () => {
  const user = { login: "octocat", id: 1, html_url: "https://github.com/octocat", type: "User", name: null, email: null, bio: null, company: null, location: null, blog: null };
  const org = { login: "github", id: 1, url: "https://api.github.com/orgs/github", description: null, name: null };
  const repo = { id: 1, name: "Hello-World", full_name: "octocat/Hello-World", html_url: "https://github.com/octocat/Hello-World", description: null, language: null };
  const SIBLINGS: [string, Record<string, unknown>, unknown, string, string[]][] = [
    ["users.list", {}, [user], "users", ["name"]],
    ["orgs.members.list", { org: "github" }, [user], "members", ["name"]],
    ["search.users", { q: "octo" }, { total_count: 1, incomplete_results: false, items: [user] }, "items", ["name"]],
    ["orgs.list", {}, [org], "organizations", ["name"]],
    ["search.orgs", { q: "git" }, { total_count: 1, incomplete_results: false, items: [org] }, "items", ["name", "description"]],
    ["search.repositories", { q: "hello" }, { total_count: 1, incomplete_results: false, items: [repo] }, "items", ["description"]],
  ];
  for (const [key, input, body, arr, fields] of SIBLINGS) {
    test(`${key}: ${fields.join(", ")} null upstream -> null, and the declared schema allows it`, async () => {
      const { output } = await run(key, input, body);
      const { connector: _c, action: _a, source: _s, ...payload } = output;
      const itemSchema = ops[key]!.outputSchema.properties[arr].items;
      for (const f of fields) {
        expect(output[arr][0][f], `${key} ${f}`).toBeNull();
        expect(itemSchema.properties[f].type, `${key} ${f}`).toEqual(["string", "null"]);
      }
      // Type-check the declared item fields that are present (sibling schemas stay open).
      expect(schemaErrors(payload[arr][0], { ...itemSchema, required: [] })).toEqual([]);
    });
  }
});
