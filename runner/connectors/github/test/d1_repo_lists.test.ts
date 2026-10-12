import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import coverage from "../fixtures/composio-coverage.json";
import { defaultConnectorRegistry } from "../../../bun/src/registry";
import { executeCommitsListSync, executeIssuesListSync, executePullRequestsListSync } from "../src/sync";

// GitHub D1 (v0.87.0, +3 actions: 800 actions + 47 webhook + 4 sync = 851 ops; 46 Composio triggers).
// GITHUB_LIST_COMMITS / LIST_PULL_REQUESTS / LIST_REPOSITORY_ISSUES were "covered" only by the
// kind=sync ops commits.list / pull_requests.list / issues.list, which are tool=false and never
// polled for GitHub. repos.commits.list / repos.pulls.list / repos.issues.list are the action tools;
// they reuse the sync normalizers (same item shape) and the sync ops stay unchanged.
// Fixtures (fixtures/d1/) are the pinned spec's documented examples (rest-api-description 58b1e0c0)
// plus sparse variants (nullable fields null) and a mixed issues page (one pull request, one issue).

type Op = Record<string, any>;
const ops = manifest.operations as Record<string, Op>;
const fixture = (name: string) => require(`../fixtures/d1/${name}.json`);
const OWNER = { owner: "octocat", repo: "Hello-World" };
const D1 = ["repos.commits.list", "repos.pulls.list", "repos.issues.list"] as const;
const LIST_KEY: Record<string, string> = { "repos.commits.list": "commits", "repos.pulls.list": "pullRequests", "repos.issues.list": "issues" };
const ENVELOPE = new Set(["connector", "action", "source"]);

function schemaErrors(value: unknown, schema: any, path = "$"): string[] {
  if (!schema || typeof schema !== "object") return [];
  const types: string[] | null = schema.type === undefined ? null : Array.isArray(schema.type) ? schema.type : [schema.type];
  const kind = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  if (types && !types.some((t) => t === kind || (t === "integer" && typeof value === "number" && Number.isInteger(value)))) return [`${path}: ${kind} is not ${types.join("|")}`];
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) return [`${path}: not in enum`];
  const errors: string[] = [];
  if (kind === "object" && schema.properties) {
    for (const [key, sub] of Object.entries(schema.properties)) {
      const v = (value as Record<string, unknown>)[key];
      if (v === undefined) errors.push(`${path}.${key}: missing`);
      else errors.push(...schemaErrors(v, sub, `${path}.${key}`));
    }
    if (schema.additionalProperties === false) for (const key of Object.keys(value as object)) if (!(key in schema.properties)) errors.push(`${path}.${key}: not declared`);
  }
  if (kind === "array" && schema.items) (value as unknown[]).forEach((v, i) => errors.push(...schemaErrors(v, schema.items, `${path}[${i}]`)));
  return errors;
}

/** Closed copy: additionalProperties:false on every object with properties, except raw (passthrough). */
function closed(schema: any): any {
  const copy = structuredClone(schema);
  const walk = (s: any, key?: string) => {
    if (!s || typeof s !== "object" || key === "raw") return;
    if (s.properties) {
      s.additionalProperties = false;
      for (const [k, sub] of Object.entries(s.properties)) walk(sub, k);
    }
    if (s.items) walk(s.items);
  };
  walk(copy);
  return copy;
}

type Reply = { status?: number; body: unknown; headers?: Record<string, string> };
async function run(op: string, input: Record<string, unknown>, reply: Reply) {
  const calls: string[] = [];
  const fetch = (async (url: unknown, init?: { method?: string }) => {
    const u = new URL(String(url));
    calls.push(`${init?.method ?? "GET"} ${u.pathname}${u.search}`);
    return Response.json(reply.body, { status: reply.status ?? 200, headers: reply.headers });
  }) as unknown as typeof globalThis.fetch;
  try {
    const result: any = defaultConnectorRegistry.executeAction("github", op, { ...input, accessToken: "t", fetch });
    if (!result.ok) return { calls, error: result };
    return { calls, output: (await Promise.resolve(result.output)) as Record<string, any> };
  } catch (error) {
    return { calls, error };
  }
}

function strictErrors(op: string, output: Record<string, unknown>): string[] {
  const schema = ops[op]!.outputSchema;
  const { connector: _c, action: _a, source: _s, ...payload } = output;
  const errors = schemaErrors(payload, closed(schema));
  for (const k of Object.keys(output)) if (!ENVELOPE.has(k) && !(k in schema.properties)) errors.push(`$.${k}: not declared (top level)`);
  return errors;
}

const withoutRaw = (items: Record<string, unknown>[]) => items.map(({ raw: _raw, ...rest }) => rest);

describe("D1: manifest and op accounting", () => {
  test("v0.87.0: 800 actions + 47 webhook + 4 sync = 851 ops", () => {
    expect(manifest.version).toBe("0.89.5");
    const kinds: Record<string, number> = {};
    for (const op of Object.values(ops)) kinds[op.kind] = (kinds[op.kind] ?? 0) + 1;
    expect(kinds).toEqual({ action: 801, webhook: 47, sync: 12 });
    expect(Object.keys(ops)).toHaveLength(860);
  });

  test("the 3 D1 ops are read actions with no effect keys, wired in the registry", () => {
    for (const op of D1) {
      const spec = ops[op]!;
      expect(spec.kind).toBe("action");
      expect(spec.sideEffect).toBe("read");
      expect(spec.effectPolicy).toBeUndefined();
      expect(spec.reconcile).toBeUndefined();
      expect(spec.inputSchema.required).toEqual(["owner", "repo"]);
      expect(Object.keys(spec.outputSchema.properties)).toEqual([LIST_KEY[op]]);
    }
  });

  test("the sync ops stay kind=sync with no schema, and are not action tools", () => {
    for (const key of ["commits.list", "pull_requests.list", "issues.list", "repositories.list"]) {
      expect(ops[key]).toEqual({ kind: "sync", timeoutMs: 30000, maxInputBytes: 65536, maxResponseBytes: 5242880 });
    }
  });

  test("list items declare exactly the sync normalizers' item schema (shared with commits.get / issues.get / commits.pulls.list)", () => {
    expect(ops["repos.commits.list"]!.outputSchema.properties.commits.items).toEqual(ops["commits.get"]!.outputSchema.properties.commit);
    expect(ops["repos.issues.list"]!.outputSchema.properties.issues.items).toEqual(ops["issues.get"]!.outputSchema.properties.issue);
    expect(ops["repos.pulls.list"]!.outputSchema.properties.pullRequests.items).toEqual(ops["commits.pulls.list"]!.outputSchema.properties.pullRequests.items);
  });
});

const CASES: [string, string, string, (body: any) => any[]][] = [
  ["repos.commits.list", "default", "GET /repos/octocat/Hello-World/commits", (b) => executeCommitsListSync({ response: b }).items],
  ["repos.commits.list", "sparse", "GET /repos/octocat/Hello-World/commits", (b) => executeCommitsListSync({ response: b }).items],
  ["repos.pulls.list", "default", "GET /repos/octocat/Hello-World/pulls", (b) => executePullRequestsListSync({ response: b }).items],
  ["repos.pulls.list", "sparse", "GET /repos/octocat/Hello-World/pulls", (b) => executePullRequestsListSync({ response: b }).items],
  ["repos.issues.list", "mixed", "GET /repos/octocat/Hello-World/issues", (b) => executeIssuesListSync({ response: b }).items],
  ["repos.issues.list", "sparse", "GET /repos/octocat/Hello-World/issues", (b) => executeIssuesListSync({ response: b }).items],
];

describe("D1: documented and sparse fixtures", () => {
  for (const [op, variant, first, sync] of CASES) {
    test(`${op} (${variant}): one GET, closed-schema valid, same items as the sync op, raw is the upstream item`, async () => {
      const body = fixture(`${op}.${variant}`);
      const { calls, output, error } = await run(op, OWNER, { body });
      expect(error).toBeUndefined();
      expect(calls).toEqual([first]);
      expect(strictErrors(op, output!)).toEqual([]);
      const items = output![LIST_KEY[op]!] as Record<string, unknown>[];
      expect(items.length).toBeGreaterThan(0);
      const syncItems = sync(body);
      if (op === "repos.issues.list" && variant === "sparse") {
        // Known sync-only divergence (TR-5 sync-only class): parseIssuesResponse keeps only object
        // labels, so the sync record drops plain-string labels. The action normalizes the upstream
        // item directly (spec: labels are string | object) and keeps them.
        expect(items[0]!.labels).toEqual(["bug", "ui"]);
        expect(syncItems[0].labels).toEqual(["ui"]);
        const noLabels = (xs: Record<string, unknown>[]) => withoutRaw(xs).map(({ labels: _l, ...rest }) => rest);
        expect(noLabels(items)).toEqual(noLabels(syncItems));
      } else expect(withoutRaw(items)).toEqual(withoutRaw(syncItems));
      const upstream = (body as Record<string, unknown>[]).filter((i) => op !== "repos.issues.list" || i.pull_request === undefined);
      expect(items.map((i) => i.raw)).toEqual(upstream);
    });
  }

  test("repos.issues.list leaves out pull requests (pull_request key), like the sync op", async () => {
    const body = fixture("repos.issues.list.mixed");
    expect(body).toHaveLength(2);
    const { output } = await run("repos.issues.list", OWNER, { body });
    expect(output!.issues.map((i: any) => i.number)).toEqual([body[1].number]);
    const only = await run("repos.issues.list", OWNER, { body: fixture("repos.issues.list.default") });
    expect(only.output!.issues).toEqual([]);
  });

  test("sparse: spec-nullable fields are null, never \"\" (no fabricated defaults)", async () => {
    const c = (await run("repos.commits.list", OWNER, { body: fixture("repos.commits.list.sparse") })).output!.commits[0];
    expect([c.author, c.authorEmail, c.committer, c.committerEmail, c.authoredAt, c.committedAt]).toEqual([null, null, null, null, null, null]);
    const p = (await run("repos.pulls.list", OWNER, { body: fixture("repos.pulls.list.sparse") })).output!.pullRequests[0];
    expect([p.author, p.body, p.headRepo, p.repositoryUrl, p.mergedAt, p.closedAt]).toEqual([null, null, null, null, null, null]);
    expect(p.baseRepo).toBe(fixture("repos.pulls.list.sparse")[0].base.repo.full_name);
    const i = (await run("repos.issues.list", OWNER, { body: fixture("repos.issues.list.sparse") })).output!.issues[0];
    expect([i.body, i.author, i.assignee, i.closedAt]).toEqual([null, null, null, null]);
    expect(i.labels).toEqual(["bug", "ui"]);
  });
});

describe("D1: requests", () => {
  test("every spec query parameter is forwarded under its spec name; nothing is added", async () => {
    const commits = await run("repos.commits.list", { ...OWNER, sha: "main", path: "src/a.ts", author: "octocat", committer: "monalisa", since: "2026-01-01T00:00:00Z", until: "2026-02-01T00:00:00Z", perPage: 50, page: 2 }, { body: [] });
    expect(commits.calls).toEqual(["GET /repos/octocat/Hello-World/commits?sha=main&path=src%2Fa.ts&author=octocat&committer=monalisa&since=2026-01-01T00%3A00%3A00Z&until=2026-02-01T00%3A00%3A00Z&per_page=50&page=2"]);
    const pulls = await run("repos.pulls.list", { ...OWNER, state: "all", head: "octocat:feature", base: "main", sort: "long-running", direction: "asc", perPage: 10 }, { body: [] });
    expect(pulls.calls).toEqual(["GET /repos/octocat/Hello-World/pulls?state=all&head=octocat%3Afeature&base=main&sort=long-running&direction=asc&per_page=10"]);
    const issues = await run("repos.issues.list", { ...OWNER, milestone: "*", state: "closed", assignee: "none", type: "Bug", creator: "octocat", mentioned: "monalisa", labels: "bug,ui", sort: "comments", direction: "desc", since: "2026-01-01T00:00:00Z", page: 3 }, { body: [] });
    expect(issues.calls).toEqual(["GET /repos/octocat/Hello-World/issues?milestone=*&state=closed&assignee=none&type=Bug&creator=octocat&mentioned=monalisa&labels=bug%2Cui&sort=comments&direction=desc&since=2026-01-01T00%3A00%3A00Z&page=3"]);
    for (const op of D1) {
      const bare = await run(op, OWNER, { body: [] });
      expect(bare.calls[0]).toBe(`GET /repos/octocat/Hello-World/${op.split(".")[1]}`);
      expect(bare.output![LIST_KEY[op]!]).toEqual([]);
    }
  });

  test("path guards: owner/repo dot segments, slashes and blanks fail before any fetch", async () => {
    for (const op of D1) {
      for (const bad of ["..", ".", "a/b", "", " ", "a\\b"]) {
        for (const field of ["owner", "repo"]) {
          const { calls, error } = await run(op, { ...OWNER, [field]: bad }, { body: [] });
          expect(calls).toEqual([]);
          expect(error).toBeDefined();
        }
      }
    }
  });

  test("bad enums, timestamps, page bounds and unknown-typed values are rejected before any fetch", async () => {
    const bad: [string, Record<string, unknown>][] = [
      ["repos.pulls.list", { state: "merged" }],
      ["repos.pulls.list", { sort: "popular" }],
      ["repos.issues.list", { direction: "up" }],
      ["repos.issues.list", { since: "yesterday" }],
      ["repos.commits.list", { until: "not-a-date" }],
      ["repos.commits.list", { perPage: 101 }],
      ["repos.commits.list", { page: 0 }],
      ["repos.commits.list", { sha: "" }],
      ["repos.issues.list", { labels: 7 }],
    ];
    for (const [op, extra] of bad) {
      const { calls, error } = await run(op, { ...OWNER, ...extra }, { body: [] });
      expect(calls, `${op} ${JSON.stringify(extra)}`).toEqual([]);
      expect(error).toBeDefined();
    }
  });
});

describe("D1: upstream errors", () => {
  for (const op of D1) {
    test(`${op}: 404 / 409 / 422 are CONNECTOR_UPSTREAM_ERROR; 429 is CONNECTOR_RATE_LIMITED with retry-after; a malformed list is rejected`, async () => {
      for (const status of [404, 409, 422]) {
        const { error } = await run(op, OWNER, { status, body: { message: "x" } });
        expect(JSON.stringify(error)).toContain("CONNECTOR_UPSTREAM_ERROR");
      }
      const limited = await run(op, OWNER, { status: 429, body: { message: "x" }, headers: { "retry-after": "30" } });
      expect(JSON.stringify(limited.error)).toContain("CONNECTOR_RATE_LIMITED");
      expect(JSON.stringify(limited.error)).toContain("30");
      for (const body of [{ items: [] }, [{ title: "no id" }], ["x"]]) {
        const { error } = await run(op, OWNER, { body });
        expect(JSON.stringify(error)).toContain("malformed");
      }
    });
  }
});

describe("D1: coverage map (gate rule: a slug counts only when it maps to an ACTION op)", () => {
  const mapped = coverage.mapped as Record<string, string>;
  test("every mapped op exists and is kind=action (sync and webhook ops never cover a slug)", () => {
    const bad = Object.entries(mapped).filter(([, op]) => ops[op]?.kind !== "action").map(([slug, op]) => `${slug} -> ${op} (${ops[op]?.kind ?? "absent"})`);
    expect(bad).toEqual([]);
  });

  test("the 3 list slugs map to the D1 actions", () => {
    expect(mapped.GITHUB_LIST_COMMITS).toBe("repos.commits.list");
    expect(mapped.GITHUB_LIST_PULL_REQUESTS).toBe("repos.pulls.list");
    expect(mapped.GITHUB_LIST_REPOSITORY_ISSUES).toBe("repos.issues.list");
    for (const op of D1) expect(coverage.added as string[]).toContain(op);
  });

  test("DELETE_DISCUSSION(_COMMENT) are team discussions (Composio inputs org + team_slug): missing_still with cite, not repo-discussion ops", () => {
    const missing = new Map((coverage.missing_still as { slug: string; reason: string }[]).map((m) => [m.slug, m.reason]));
    for (const slug of ["GITHUB_DELETE_DISCUSSION", "GITHUB_DELETE_DISCUSSION_COMMENT"]) {
      expect(mapped[slug]).toBeUndefined();
      expect(missing.get(slug)).toContain("team_slug");
      expect(missing.get(slug)).toContain("sunset-notice-team-discussions");
    }
    expect(Object.keys(mapped).length + missing.size).toBe(897);
    expect(Object.keys(mapped)).toHaveLength(827);
    expect(ops["graphql.discussions.delete"]!.description).not.toContain("GITHUB_DELETE_DISCUSSION");
  });
});
