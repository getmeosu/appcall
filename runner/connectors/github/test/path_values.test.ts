import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import table from "../src/path_value_fields.json";
import { defaultConnectorRegistry } from "../../../bun/src/registry";
import { errorResponseForExecutionFailure } from "../../../bun/src/server";
import { pathValueViolation, requirePathValue } from "../src/path_values";

// FIX-SEGMENT-3 (0.86.4): every input field that reaches a GitHub REST path (required and
// optional), plus the lookup keys of deployments.get / releases.assets.get / discussions.*, must
// be non-blank and carry no leading or trailing whitespace. '', ' ', '\t', ' x' and 'x ' fail
// with INVALID_ACTION_INPUT and 0 fetches; omitting an optional trailing field still works and
// drops the segment. The op/field table is re-derived here by sentinel discovery.

type Seen = { method: string; url: string };
type Cls = "path" | "selector" | "text-selector";
const ops = manifest.operations as Record<string, any>;
const TABLE = table as Record<string, Record<string, Cls>>;

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
  "user.packages.versions.get": { packageType: "npm", packageVersionId: 1 },
  "user.packages.delete": { packageType: "npm" },
  "user.packages.versions.list": { packageType: "npm" },
  "advisories.get": { ghsaId: "GHSA-2c3f-4g5h-6j7m" },
  "user.codespaces.update": { displayName: "d" },
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
// Path fields that sentinel discovery cannot see because an alias with precedence is set in the
// base input (git.tags.get sha/tagSha, environments.get name/environment), and the lookup keys
// (not path; query or GraphQL variable) of the ok:false -> INVALID_ACTION_INPUT ops.
const FIXED: Record<string, Record<string, Cls>> = {
  "git.tags.get": { tagSha: "path" },
  "environments.get": { environment: "path" },
  "deployments.get": { ref: "selector", environment: "selector" },
  "releases.assets.get": { name: "selector" },
  "discussions.get": { discussionId: "selector", title: "text-selector" },
  "discussions.comments.list": { discussionId: "selector" },
  "discussions.comments.create": { discussionId: "selector" },
  "discussions.comments.update": { discussionId: "selector" },
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

function stringy(s: any): boolean {
  if (!s || s.enum || s.const !== undefined) return false;
  const t = Array.isArray(s.type) ? s.type : [s.type];
  if (t.includes("string")) return true;
  return ["oneOf", "anyOf"].some((k) => Array.isArray(s[k]) && s[k].some(stringy));
}

// Outcome as the runner reports it: a registry ok:false keeps its code; a rejected handler/guard
// error maps through errorResponseForExecutionFailure (plain Error -> INVALID_ACTION_INPUT).
async function call(op: string, input: Record<string, unknown>) {
  const r = recorder();
  let code = "";
  let message = "";
  try {
    const result: any = defaultConnectorRegistry.executeAction("github", op, { ...input, accessToken: "tok", fetch: r.fetch });
    if (!result || result.ok === false) {
      code = String(result?.code ?? "");
      message = String(result?.message ?? "");
    } else await Promise.resolve(result.output);
  } catch (error: any) {
    const mapped = errorResponseForExecutionFailure(error, "INVALID_ACTION_INPUT", "Action input is invalid.");
    code = mapped.error.code;
    message = mapped.error.message;
  }
  return { seen: r.seen, code, message };
}

const BLANK = ["", " ", "\t"];
const PADDED = [" x", "x "];

describe("FIX-SEGMENT-3: blank and whitespace-padded path values", () => {
  test("the op/field table matches sentinel discovery (required and optional fields) and the manifest routes", async () => {
    const discovered: Record<string, Record<string, Cls>> = {};
    for (const [op, spec] of Object.entries(ops)) {
      if (spec.kind !== "action") continue;
      const input = baseInput(op);
      const base = await call(op, input);
      if (!base.seen[0]) continue;
      for (const [field, schema] of Object.entries(spec.inputSchema?.properties ?? {})) {
        if (!stringy(schema)) continue;
        const sentinel = `zzs${field.replace(/[^a-z0-9]/gi, "").toLowerCase()}zz`;
        const c = await call(op, { ...input, [field]: sentinel });
        let hit = c.seen.some((s) => new URL(s.url).pathname.includes(sentinel));
        // Handler-validated values (package type list, GHSA id): the base value is an exact path segment.
        if (!hit && c.seen.length === 0 && typeof input[field] === "string" && (input[field] as string).length > 0) {
          hit = new URL(base.seen[0].url).pathname.split("/").includes(encodeURIComponent(input[field] as string));
        }
        if (hit) (discovered[op] ??= {})[field] = "path";
      }
    }
    for (const [op, fields] of Object.entries(FIXED)) for (const [f, c] of Object.entries(fields)) (discovered[op] ??= {})[f] ??= c;
    const sorted = (t: Record<string, Record<string, Cls>>) => Object.fromEntries(Object.keys(t).sort().map((k) => [k, Object.fromEntries(Object.keys(t[k]!).sort().map((f) => [f, t[k]![f]]))]));
    expect(sorted(discovered)).toEqual(sorted(TABLE));
    // Manifest route params whose input is a string field are in the table, except the two
    // query parameters the description shows in the route line.
    const camel = (s: string) => s.replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase());
    const missing: string[] = [];
    for (const [op, spec] of Object.entries(ops)) {
      if (spec.kind !== "action") continue;
      const props = spec.inputSchema?.properties ?? {};
      for (const [, route] of String(spec.description ?? "").matchAll(/\b(?:GET|POST|PUT|PATCH|DELETE)\s+(\/[^\s,;]+)/g)) {
        for (const [, param] of route!.matchAll(/\{([a-z_]+)\}/g)) {
          const field = [param!, camel(param!)].find((f) => f in props);
          if (field && stringy(props[field]) && TABLE[op]?.[field] === undefined) missing.push(`${op}.${field}`);
        }
      }
    }
    expect(missing.sort()).toEqual(["actions.caches.delete_by_key.key", "orgs.packages.list.packageType"]);
  }, 600000);

  test("coverage: exact op and field counts", () => {
    const fields = Object.values(TABLE).flatMap((f) => Object.values(f));
    expect(Object.keys(TABLE)).toHaveLength(683); // D1 (0.87.0): +3, was 680
    expect(fields).toHaveLength(1350); // D1: +6 path fields (was 1344)
    const byClass: Record<string, number> = {};
    for (const c of fields) byClass[c] = (byClass[c] ?? 0) + 1;
    expect(byClass).toEqual({ path: 1342, selector: 7, "text-selector": 1 });
    const optional = Object.entries(TABLE).flatMap(([op, f]) => Object.entries(f).filter(([k, c]) => c === "path" && !(ops[op].inputSchema?.required ?? []).includes(k)).map(([k]) => `${op}.${k}`));
    expect(optional.sort()).toEqual([
      "actions.org_variables.update.current_name", "environments.get.environment", "environments.get.name",
      "git.refs.list.ref", "git.tags.get.sha", "git.tags.get.tagSha", "labels.get.newName",
    ]);
    for (const op of Object.keys(TABLE)) expect(ops[op]?.kind, op).toBe("action");
  });

  test("'', ' ', '\\t', ' x', 'x ' in every path / lookup field: INVALID_ACTION_INPUT, 0 fetches", async () => {
    const leaks: string[] = [];
    let cases = 0;
    for (const [op, fields] of Object.entries(TABLE)) {
      const input = baseInput(op);
      for (const [field, cls] of Object.entries(fields)) {
        // discussions.get title is a free-text match: blank is rejected, padding is not.
        for (const value of cls === "text-selector" ? BLANK : [...BLANK, ...PADDED]) {
          cases += 1;
          const c = await call(op, { ...input, [field]: value });
          if (c.seen.length > 0 || c.code !== "INVALID_ACTION_INPUT") leaks.push(`${op}.${field}=${JSON.stringify(value)} -> ${c.seen.length} fetches, ${c.code || "ok"} ${c.seen[0]?.url ?? c.message}`);
          else if (!c.message.includes(field) && !c.message.includes(field.replace(/_([a-z])/g, (_m, l: string) => l.toUpperCase()))) leaks.push(`${op}.${field}=${JSON.stringify(value)} message: ${c.message}`);
        }
      }
    }
    expect(leaks).toEqual([]);
    expect(cases).toBe(6748); // 1349 path/selector fields x 5 + 1 text-selector x 3 (D1 +30; was 6718)
  }, 600000);

  test("omitting an optional trailing path field still works and drops the segment", async () => {
    const ALT: Record<string, Record<string, unknown>> = {
      "environments.get.name": { environment: "env1" },
      "environments.get.environment": { name: "env1" },
      "git.tags.get.sha": { tagSha: SHA },
      "git.tags.get.tagSha": { sha: SHA },
    };
    const urls: Record<string, string> = {};
    for (const [op, fields] of Object.entries(TABLE)) {
      for (const [field, cls] of Object.entries(fields)) {
        if (cls !== "path" || (ops[op].inputSchema?.required ?? []).includes(field)) continue;
        const { [field]: _omit, ...rest } = baseInput(op);
        if (op === "environments.get" || op === "git.tags.get") {
          delete rest.name; delete rest.environment; delete rest.sha; delete rest.tagSha;
        }
        const c = await call(op, { ...rest, ...(ALT[`${op}.${field}`] ?? {}) });
        expect(c.seen.length, `${op}.${field}: ${c.message}`).toBeGreaterThan(0);
        const path = new URL(c.seen[0]!.url).pathname;
        expect(path.endsWith("/") || path.includes("//"), path).toBe(false);
        urls[`${op}.${field}`] = path;
      }
    }
    expect(urls["git.refs.list.ref"]).toBe("/repos/zq0x/zq1x/git/refs");
    expect(urls["labels.get.newName"]).toBe("/repos/zq0x/zq1x/labels/zq2x");
    expect(urls["environments.get.name"]).toBe("/repos/o/r/environments/env1");
    expect(urls["git.tags.get.sha"]).toBe(`/repos/zq0x/zq1x/git/tags/${SHA}`);
  });

  test("linus / oxide examples", async () => {
    for (const [op, input] of [
      ["git.refs.list", { owner: "o", repo: "r", ref: "" }],
      ["git.refs.list", { owner: "o", repo: "r", ref: " " }],
      ["labels.get", { owner: "o", repo: "r", name: "bug", newName: "" }],
      ["repos.get", { owner: " octocat ", repo: "r" }],
      ["users.get_by_username", { username: " octocat " }],
      ["orgs.get", { org: "octo-org " }],
      ["deployments.get", { owner: "o", repo: "r", ref: " " }],
      ["deployments.get", { owner: "o", repo: "r", ref: "main " }],
      ["environments.get", { owner: "o", repo: "r", name: " prod" }],
      ["releases.assets.get", { owner: "o", repo: "r", releaseId: 1, name: " " }],
      ["discussions.get", { owner: "o", repo: "r", discussionId: " " }],
    ] as const) {
      const c = await call(op, input as Record<string, unknown>);
      expect({ op, fetches: c.seen.length, code: c.code }).toEqual({ op, fetches: 0, code: "INVALID_ACTION_INPUT" });
    }
    const ok = await call("git.refs.list", { owner: "o", repo: "r", ref: "heads/main" });
    expect(ok.seen.map((s) => s.url)).toEqual(["https://api.github.com/repos/o/r/git/matching-refs/heads/main"]);
  });

  test("helpers: requirePathValue and pathValueViolation", () => {
    expect(requirePathValue("octocat", "username")).toBe("octocat");
    for (const v of ["", " ", "\t", undefined, 7]) expect(() => requirePathValue(v, "username")).toThrow("username is required and must not be blank");
    for (const v of [" octocat", "octocat ", "\toctocat"]) expect(() => requirePathValue(v, "username")).toThrow("username must not have leading or trailing whitespace");
    expect(pathValueViolation("repos.get", { owner: "o", repo: "r" })).toBeNull();
    expect(pathValueViolation("git.refs.list", { owner: "o", repo: "r" })).toBeNull();
    expect(String(pathValueViolation("git.refs.list", { owner: "o", repo: "r", ref: "" }))).toContain("ref must not be blank");
    expect(String(pathValueViolation("git.refs.list", { owner: "o", repo: "r", ref: null }))).toContain("ref must be a string");
    expect(pathValueViolation("discussions.get", { owner: "o", repo: "r", title: " Padded title " })).toBeNull();
    expect(pathValueViolation("deployments.get", { owner: "o", repo: "r", deploymentId: 7 })).toBeNull();
    expect(pathValueViolation("graphql.query", { body: { query: " " } })).toBeNull();
  });
});
