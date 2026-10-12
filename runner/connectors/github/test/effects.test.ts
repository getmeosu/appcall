import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import * as actions from "../src/actions";
import { defaultConnectorRegistry } from "../../../bun/src/registry";
import { RECONCILE_KEEP } from "./effects_final";

// FIX-EFFECTS (linus final rules): no Idempotent anywhere (policy or description); creates and
// resource deletes carry no effect keys; a kept Reconcile observes an exact read whose output
// is this op's own output schema (run through the registry below); everything else omits.
// REST user.following.follow/unfollow require user:follow. Recorders only.

type Op = Record<string, any>;
const ops = manifest.operations as Record<string, Op>;
const EFFECT_KEYS = ["effectPolicy", "reconcile", "reconcileInput"] as const;
const effectKeys = (op: Op) => EFFECT_KEYS.filter((key) => key in op);

/** HTTP method of an op: the request block, else the first verb its description names. */
function methodOf(op: Op): string | null {
  if (op.request?.method) return String(op.request.method).toUpperCase();
  const match = /\b(GET|POST|PUT|PATCH|DELETE)\b/.exec(String(op.description ?? ""));
  return match ? match[1]! : null;
}

// Resource deletes that carried effect keys before FIX-EFFECTS (the audit's 21 C9 deletes,
// teams.membership.remove counted there, are all here).
const STRIPPED_DELETES = [
  "repos.contents.delete", "releases.delete", "pull_requests.reviews.delete_pending", "gists.delete",
  "git.refs.delete", "deployments.delete", "environments.delete", "actions.artifacts.delete",
  "actions.variables.delete", "actions.environment_variables.delete", "actions.org_variables.delete",
  "deployments.branch_policies.delete", "actions.caches.delete", "actions.caches.delete_by_key",
  "actions.runs.delete", "issues.comments.delete", "labels.delete", "branches.delete",
  "pull_requests.review_comments.delete", "commits.comments.delete", "teams.membership.remove",
] as const;

// Every create (parity's 30: the 10 formerly Idempotent, 16 Reconcile creates and the 4 natural-key creates).
const CREATES = [
  "actions.environment_variables.create",
  "actions.org_variables.create",
  "actions.variables.create",
  "checks.runs.create",
  "commits.comments.create",
  "commits.statuses.create",
  "deployments.branch_policies.create",
  "deployments.create",
  "deployments.statuses.create",
  "discussions.comments.create",
  "discussions.create",
  "environments.create",
  "git.blobs.create",
  "git.commits.create",
  "git.refs.create",
  "git.tags.create",
  "git.trees.create",
  "labels.create",
  "milestones.create",
  "orgs.repos.create",
  "pull_requests.review_comments.create",
  "pull_requests.review_comments.reply",
  "pull_requests.reviews.create",
  "releases.assets.upload",
  "repos.contents.push_files",
  "repos.contents.put",
  "repos.fork",
  "repos.hooks.create",
  "repos.merges",
  "teams.create",
] as const;

describe("github FIX-EFFECTS: manifest guards", () => {
  test("version 0.87.0 at 851 ops", () => {
    expect(manifest.version).toBe("0.89.4");
    expect(Object.keys(ops)).toHaveLength(860);
  });

  test("no op declares effectPolicy Idempotent, and no description still claims it", () => {
    const idempotent = Object.keys(ops).filter((key) => ops[key]!.effectPolicy === "Idempotent");
    expect(idempotent).toEqual([]);
    const claims = Object.keys(ops).filter((key) => /\bIdempotent\b/.test(String(ops[key]!.description)));
    // FIX-DESTRUCTIVE amend: field-level descriptions (input and output schemas, any depth) too.
    const fieldClaims: string[] = [];
    const walk = (s: unknown, path: string) => {
      if (Array.isArray(s)) s.forEach((v, i) => walk(v, `${path}[${i}]`));
      else if (s && typeof s === "object") {
        for (const [k, v] of Object.entries(s)) {
          if (k === "description" && typeof v === "string" && /idempotent/i.test(v)) fieldClaims.push(path);
          else walk(v, `${path}.${k}`);
        }
      }
    };
    for (const key of Object.keys(ops)) {
      walk(ops[key]!.inputSchema, `${key}.inputSchema`);
      walk(ops[key]!.outputSchema, `${key}.outputSchema`);
    }
    expect(fieldClaims).toEqual([]);
    expect(claims).toEqual([]);
    for (const op of Object.values(ops)) {
      if (op.effectPolicy !== undefined) expect(op.effectPolicy).toBe("Reconcile");
    }
  });

  test("every DELETE except the exact-observe detach set carries no effect keys", () => {
    const deletes = Object.keys(ops).filter((key) => ops[key]!.kind === "action" && methodOf(ops[key]!) === "DELETE");
    expect(deletes.length).toBeGreaterThanOrEqual(114); // PRUNE-1 (0.82.0) removed projects.delete + projects.columns.delete (123 -> 121); PRUNE-2 (0.83.0) removed projects.cards.delete, projects.collaborators.remove, orgs.teams.projects.remove (121 -> 118); PRUNE-3 (0.84.0) removed teams.discussions.delete (118 -> 117); PRUNE-4 (0.85.0) removed rest.apps.delete_token, rest.apps.delete_authorization, rest.apps.revoke_installation_access_token (117 -> 114); PRUNE-5 (0.86.0) removes no DELETE (114)
    const offenders = deletes.filter((key) => !(key in RECONCILE_KEEP) && effectKeys(ops[key]!).length > 0);
    expect(offenders).toEqual([]);
    for (const key of STRIPPED_DELETES) {
      expect(deletes, key).toContain(key);
      expect(effectKeys(ops[key]!), key).toEqual([]);
    }
    // GraphQL resource deletes (no REST verb) also stay clean.
    const graphqlDeletes = Object.keys(ops).filter((key) => key.startsWith("graphql.") && /\.delete$/.test(key));
    expect(graphqlDeletes.length).toBeGreaterThan(0);
    for (const key of graphqlDeletes) expect(effectKeys(ops[key]!), key).toEqual([]);
  });

  test("no create carries effect keys: the explicit 30 plus a POST-collection / create-name heuristic", () => {
    expect(CREATES).toHaveLength(30);
    for (const key of CREATES) {
      expect(ops[key]!.sideEffect, key).toBe("write");
      expect(effectKeys(ops[key]!), key).toEqual([]);
      expect(String(ops[key]!.description), key).toContain("No effectPolicy and no reconcile");
    }
    const createLike = (key: string, op: Op) => {
      if (op.kind !== "action" || op.sideEffect !== "write") return false;
      if (/\.(create|create_[a-z_]+|reply|upload|fork|merges|generate|duplicate)$/.test(key)) return true;
      // POST to a collection route (last path segment is not a {param}) whose title says Create/Fork/Generate/Upload.
      const route = /\bPOST\s+(\/[^\s,;]+)/.exec(String(op.description ?? ""))?.[1]?.replace(/\.$/, "");
      return Boolean(route && !/\}$/.test(route) && /^(Create|Fork|Generate|Upload)\b/i.test(String(op.title ?? "")));
    };
    const offenders = Object.keys(ops).filter((key) => createLike(key, ops[key]!) && effectKeys(ops[key]!).length > 0);
    expect(offenders).toEqual([]);
    expect(Object.keys(ops).filter((key) => createLike(key, ops[key]!)).length).toBeGreaterThanOrEqual(CREATES.length);
    expect(effectKeys(ops["git.refs.update"]!)).toEqual([]);
  });

  test("effect keys appear on exactly the kept-Reconcile table, each an exact read observe on the same input", () => {
    const withKeys = Object.keys(ops).filter((key) => effectKeys(ops[key]!).length > 0).sort();
    expect(withKeys).toEqual(Object.keys(RECONCILE_KEEP).sort());
    for (const [key, observe] of Object.entries(RECONCILE_KEEP)) {
      const op = ops[key]!;
      expect(op.effectPolicy, key).toBe("Reconcile");
      expect(op.reconcile, key).toBe(observe);
      expect(op.reconcileInput, key).toBeUndefined();
      const obs = ops[observe]!;
      expect(obs.sideEffect, observe).toBe("read");
      // The observe's required keys come from the action input (snake_case or its camelCase alias,
      // e.g. thread_id / threadId, which the observe handler accepts).
      const props = Object.keys(op.inputSchema.properties);
      for (const required of obs.inputSchema.required ?? []) {
        const camel = String(required).replace(/_([a-z])/g, (_m: string, c: string) => c.toUpperCase());
        expect(props.includes(required) || props.includes(camel), `${key} -> ${required}`).toBe(true);
      }
    }
  });

  test("REST user.following.follow/unfollow require user:follow", () => {
    for (const key of ["user.following.follow", "user.following.unfollow"]) {
      expect(ops[key]!.requiredScopes).toEqual(["user:follow"]);
      expect(String(ops[key]!.description)).toContain("CONNECTOR_CAPABILITY_MISSING");
      expect(effectKeys(ops[key]!)).toEqual([]);
    }
    expect(manifest.auth.scopes).not.toContain("user:follow");
  });
});

type Seen = { url: string; method: string };
function recorder(responses: Response[]) {
  const seen: Seen[] = [];
  let i = 0;
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(input), method: init?.method ?? "GET" });
    const next = responses[i++];
    if (!next) throw new Error("unexpected fetch");
    return next;
  };
  return { seen, fetch };
}
const res = (status: number, body: unknown = null, headers: Record<string, string> = {}) =>
  new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("github FIX-EFFECTS: linus final verdicts", () => {
  test("star/unstar pairs, issues.comments.update, detach omits", () => {
    expect(ops["repos.star"]!.reconcile).toBe("user.starred.check");
    expect(ops["repos.unstar"]!.reconcile).toBe("user.starred.check");
    expect(ops["gists.star"]!.reconcile).toBe("gists.star.check");
    // gists.unstar returns {unstarred, gistId}; gists.star.check returns {starred, gistId}: cannot project, omit.
    expect(effectKeys(ops["gists.unstar"]!)).toEqual([]);
    // issues.get needs issueNumber (not in the input); issues.comments.get is exact on commentId.
    expect(ops["issues.comments.update"]!.reconcile).toBe("issues.comments.get");
    for (const key of ["repos.collaborators.remove", "teams.membership.remove"]) {
      expect(effectKeys(ops[key]!), key).toEqual([]);
      expect(String(ops[key]!.description), key).toContain("No effectPolicy and no reconcile");
    }
  });
});

describe("github FIX-EFFECTS: runtime through the registry", () => {
  test("labels.delete returns the primary result with no observe call", async () => {
    const r = recorder([res(204)]);
    const result = defaultConnectorRegistry.executeAction("github", "labels.delete", { owner: "o", repo: "r", name: "bug", accessToken: "t", fetch: r.fetch });
    if (!result.ok) throw new Error(JSON.stringify(result));
    const out = (await Promise.resolve(result.output)) as Record<string, unknown>;
    expect(r.seen).toHaveLength(1);
    expect(r.seen[0]!.method).toBe("DELETE");
    expect(out).toMatchObject({ action: "labels.delete", deleted: true });
  });

  test("repos.collaborators.remove returns the primary result with no observe call", async () => {
    const r = recorder([res(204)]);
    const result = defaultConnectorRegistry.executeAction("github", "repos.collaborators.remove", { owner: "o", repo: "r", username: "u", accessToken: "t", fetch: r.fetch });
    if (!result.ok) throw new Error(JSON.stringify(result));
    const out = (await Promise.resolve(result.output)) as Record<string, unknown>;
    expect(r.seen).toEqual([{ url: expect.stringContaining("/repos/o/r/collaborators/u"), method: "DELETE" }]);
    expect(out).toMatchObject({ removed: true, username: "u" });
  });

  test("repos.unstar reconciles via user.starred.check (404 = not starred)", async () => {
    const r = recorder([res(204), res(404, { message: "Not Found" })]);
    const result = defaultConnectorRegistry.executeAction("github", "repos.unstar", { owner: "o", repo: "r", accessToken: "t", fetch: r.fetch });
    if (!result.ok) throw new Error(JSON.stringify(result));
    const out = (await Promise.resolve(result.output)) as Record<string, unknown>;
    expect(r.seen.map((s) => s.method)).toEqual(["DELETE", "GET"]);
    expect(r.seen[1]!.url).toContain("/user/starred/o/r");
    expect(out).toMatchObject({ starred: false });
    // Still starred after the DELETE: the observe reports it rather than hiding it.
    const r2 = recorder([res(204), res(204)]);
    const again = defaultConnectorRegistry.executeAction("github", "repos.unstar", { owner: "o", repo: "r", accessToken: "t", fetch: r2.fetch });
    if (!again.ok) throw new Error(JSON.stringify(again));
    expect(await Promise.resolve(again.output)).toMatchObject({ starred: true });
  });
});

describe("github FIX-EFFECTS: follow / unfollow CAPABILITY_MISSING", () => {
  const cases = [
    ["followUser", "user.following.follow", "PUT"],
    ["unfollowUser", "user.following.unfollow", "DELETE"],
  ] as const;
  for (const [fn, op, method] of cases) {
    test(`${op}: 404 with none of the accepted scopes granted -> CAPABILITY_MISSING user:follow`, async () => {
      const r = recorder([res(404, { message: "Not Found" }, { "X-Accepted-OAuth-Scopes": "user, user:follow", "X-OAuth-Scopes": "repo, read:org" })]);
      const err = await Promise.resolve((actions as any)[fn]({ username: "octocat", accessToken: "t", fetch: r.fetch })).catch((e: unknown) => e);
      expect(r.seen).toEqual([{ url: expect.stringContaining("/user/following/octocat"), method }]);
      expect(err).toMatchObject({
        ok: false,
        code: "CONNECTOR_CAPABILITY_MISSING",
        reason: "permission_missing",
        missingScopes: ["user:follow"],
        requiredScopes: ["user:follow"],
        reconsentRequired: true,
        status: 404,
      });
      expect(String(err.message)).toContain(op);
    });

    test(`${op}: a granted alternative (user) keeps the provider 404 as UPSTREAM`, async () => {
      for (const headers of [{ "X-Accepted-OAuth-Scopes": "user, user:follow", "X-OAuth-Scopes": "repo, user" }, {}]) {
        const r = recorder([res(404, { message: "Not Found" }, headers)]);
        const err = await Promise.resolve((actions as any)[fn]({ username: "ghost", accessToken: "t", fetch: r.fetch })).catch((e: unknown) => e);
        expect(err).toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: "User was not found." });
      }
    });

    test(`${op}: 204 still succeeds`, async () => {
      const r = recorder([res(204)]);
      const out = await Promise.resolve((actions as any)[fn]({ username: "octocat", accessToken: "t", fetch: r.fetch }));
      expect(out).toMatchObject({ username: "octocat" });
    });
  }
});

// Every kept Reconcile, run through the registry: primary write, then the observe, whose
// output (the action result) must validate against the op's OWN outputSchema with every
// declared property present (declared-property strict, recursive). Generic fixtures.
const PRIMARY_204 = new Set([
  "actions.permissions.workflow.set", "actions.permissions.set", "actions.permissions.selected_actions.set",
  "actions.permissions.access.set", "orgs.actions.permissions.workflow.set", "orgs.actions.permissions.set", "gists.star",
]);
const INPUT_EXTRA: Record<string, Record<string, unknown>> = {
  "pull_requests.requested_reviewers.add": { reviewers: ["octocat"] },
  "pull_requests.requested_reviewers.remove": { reviewers: ["octocat"] },
  "milestones.update": { title: "t" },
  "discussions.update": { discussionNumber: 7, title: "t" },
  "repos.update": { description: "d" },
};
const UPSTREAM = {
  id: 7, number: 7, node_id: "N_1", name: "x1", title: "t", state: "open", html_url: "https://github.com/o/r",
  url: "https://api.github.com/x", full_name: "o/r", private: false, default_branch: "main", stargazers_count: 1,
  draft: false, body: "b", login: "octocat", enabled: true, labels: [], assignees: [], total_count: 0, allowed_actions: "selected",
};
const GQL = {
  data: {
    convertPullRequestToDraft: { pullRequest: { id: "PR_1", isDraft: true, state: "OPEN", updatedAt: "2026-01-01T00:00:00Z" } },
    markPullRequestReadyForReview: { pullRequest: { id: "PR_1", isDraft: false, state: "OPEN", updatedAt: "2026-01-01T00:00:00Z" } },
    repository: { discussion: { id: "D_1", number: 7, title: "t", body: "b", url: "https://github.com/o/r/discussions/7" } },
    updateDiscussion: { discussion: { id: "D_1", number: 7, title: "t", body: "b", url: "https://github.com/o/r/discussions/7" } },
  },
};

function genInput(schema: any): any {
  if (!schema) return "x";
  if (schema.enum) return schema.enum[0];
  if (schema.oneOf || schema.anyOf) return genInput((schema.oneOf || schema.anyOf)[0]);
  const t = Array.isArray(schema.type) ? schema.type.find((x: string) => x !== "null") : schema.type;
  if (t === "string") return schema.format === "uri" ? "https://example.com/x" : schema.pattern ? undefined : "x1";
  if (t === "integer" || t === "number") return Math.max(schema.minimum ?? 7, 7);
  if (t === "boolean") return true;
  if (t === "array") { const item = genInput(schema.items); return item === undefined ? [] : [item]; }
  if (t === "object" || schema.properties) {
    const o: Record<string, unknown> = {};
    for (const k of schema.required ?? []) { const v = genInput(schema.properties?.[k]); if (v !== undefined) o[k] = v; }
    return o;
  }
  return "x";
}

/** Declared-property strict check: right type, enum, and every declared property present. */
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
    for (const [key, sub] of Object.entries(schema.properties)) {
      const v = (value as Record<string, unknown>)[key];
      if (v === undefined) errors.push(`${path}.${key}: missing`);
      else errors.push(...schemaErrors(v, sub, `${path}.${key}`));
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value as Record<string, unknown>)) if (!(key in schema.properties)) errors.push(`${path}.${key}: not declared`);
    }
  }
  if (kind === "array" && schema.items) (value as unknown[]).forEach((v, i) => errors.push(...schemaErrors(v, schema.items, `${path}[${i}]`)));
  return errors;
}

describe("github FIX-EFFECTS: each kept Reconcile projects onto the op's own output schema", () => {
  test("the kept table is 26 ops (FIX-EFFECTS-b dropped orgs.teams.update; FIX-EFFECTS-c dropped 13; TR-1 amend dropped repos.interaction_limits.set)", () => {
    expect(Object.keys(RECONCILE_KEEP)).toHaveLength(26);
  });
  for (const [key, observe] of Object.entries(RECONCILE_KEEP)) {
    test(`${key} -> ${observe}`, async () => {
      const calls: string[] = [];
      const fetch = (async (url: unknown, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        const u = String(url);
        calls.push(`${method} ${u}`);
        if (u.endsWith("/graphql")) return Response.json(GQL);
        if (method !== "GET" && PRIMARY_204.has(key)) return new Response(null, { status: 204 });
        if (method === "GET" && /\/(starred\/[^/]+\/[^/]+|gists\/[^/]+\/star)$/.test(u)) return new Response(null, { status: 204 });
        return Response.json(UPSTREAM);
      }) as unknown as typeof globalThis.fetch;
      const input = { ...genInput(ops[key]!.inputSchema), ...(INPUT_EXTRA[key] ?? {}) };
      const result = defaultConnectorRegistry.executeAction("github", key, { ...input, accessToken: "t", fetch });
      if (!result.ok) throw new Error(JSON.stringify(result));
      const output = (await Promise.resolve(result.output)) as Record<string, unknown>;
      expect(calls.length, calls.join("\n")).toBeGreaterThanOrEqual(2);
      expect(output.action).toBe(observe);
      expect(schemaErrors(output, ops[key]!.outputSchema)).toEqual([]);
    });
  }
});

// FIX-EFFECTS-b (0.86.2): orgs.teams.update writes notificationSetting and parentTeamId, which
// orgs.teams.get never returns (normalizeTeam keeps id, name, slug, description, privacy,
// permission), so it is not an exact observe and carries no effect keys. This is the specific
// guard. A general "every writable input field is exposed by the observe output" check is not
// exact against this manifest: most observe output schemas are summaries or opaque objects
// (e.g. repos.get, orgs.get, branches.protection.get) and input/output names differ
// (url vs configUrl, event vs state), so it would need a hand-kept alias/exclusion table.
describe("github FIX-EFFECTS-b: orgs.teams.update stays effect-free", () => {
  test("no effect keys, not in the kept table, description says why", () => {
    const op = ops["orgs.teams.update"]!;
    expect(effectKeys(op)).toEqual([]);
    expect(op.effectPolicy).toBeUndefined();
    expect(op.reconcile).toBeUndefined();
    expect(op.reconcileInput).toBeUndefined();
    expect(op.effect).toBeUndefined();
    expect("orgs.teams.update" in RECONCILE_KEEP).toBe(false);
    expect(String(op.description)).toContain("No effectPolicy and no reconcile");
    expect(String(op.description)).not.toContain("effectPolicy Reconcile");
  });
  test("the reason holds: the op writes notificationSetting / parentTeamId and orgs.teams.get does not expose them", () => {
    const writes = Object.keys(ops["orgs.teams.update"]!.inputSchema.properties);
    expect(writes).toEqual(expect.arrayContaining(["notificationSetting", "parentTeamId"]));
    const team = ops["orgs.teams.get"]!.outputSchema.properties.team.properties;
    expect(Object.keys(team).sort()).toEqual(["description", "id", "name", "permission", "privacy", "slug"]);
  });
  test("runtime: orgs.teams.update returns the PATCH result with no observe call", async () => {
    const calls: string[] = [];
    const fetch = (async (url: unknown, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${String(url)}`);
      return Response.json({ id: 1, name: "t", slug: "t", description: "", privacy: "closed", permission: "pull", notification_setting: "notifications_disabled", parent: null });
    }) as unknown as typeof globalThis.fetch;
    const result = defaultConnectorRegistry.executeAction("github", "orgs.teams.update", { org: "octo-org", teamSlug: "t", notificationSetting: "notifications_disabled", accessToken: "t", fetch });
    if (!result.ok) throw new Error(JSON.stringify(result));
    const output = (await Promise.resolve(result.output)) as Record<string, unknown>;
    expect(calls).toEqual(["PATCH https://api.github.com/orgs/octo-org/teams/t"]);
    expect(output.action).toBe("orgs.teams.update");
  });
});

// FIX-EFFECTS-c (0.86.3): linus's rule for the flagged kept-Reconcile ops. Keep only if the observe
// reads back every field the op can write on the same id (a renamed field needs a mapping test) and
// the output validates against the op's own schema. Write-only fields (hook secret) and partial
// observes omit. The untyped `raw` passthrough does not count as reading a field back.
const KEPT_EXACT: Readonly<Record<string, string>> = {
  "actions.oidc.customization.sub.set": "actions.oidc.customization.sub.get",
  "actions.permissions.access.set": "actions.permissions.access.get",
  "actions.permissions.selected_actions.set": "actions.permissions.selected_actions.get",
  "actions.permissions.set": "actions.permissions.get",
  "actions.permissions.workflow.set": "actions.permissions.workflow.get",
  "branches.protection.update": "branches.protection.get",
  "deployments.branch_policies.update": "deployments.branch_policies.get",
  "discussions.update": "discussions.get",
  "gists.comments.update": "gists.comments.get",
  "gists.star": "gists.star.check",
  "issues.comments.update": "issues.comments.get",
  "milestones.update": "milestones.get",
  "notifications.threads.subscription.set": "notifications.threads.subscription.get",
  "orgs.actions.oidc.customization.sub.set": "orgs.actions.oidc.customization.sub.get",
  "orgs.actions.permissions.set": "orgs.actions.permissions.get",
  "orgs.actions.permissions.workflow.set": "orgs.actions.permissions.workflow.get",
  "pull_requests.convert_to_draft": "pull_requests.get",
  "pull_requests.mark_ready": "pull_requests.get",
  "pull_requests.reviews.submit": "pull_requests.reviews.get",
  "pull_requests.reviews.update": "pull_requests.reviews.get",
  "releases.assets.update": "releases.assets.get",
  "releases.update": "releases.get",
  "repos.rulesets.update": "repos.rulesets.get",
  "repos.star": "user.starred.check",
  "repos.subscription.set": "repos.subscription.get",
  "repos.unstar": "user.starred.check",
};
const EFFECTS_C_OMIT = [
  "code_scanning.alerts.update", "gists.update", "issues.assignees.add", "issues.assignees.remove",
  "orgs.hooks.update", "repos.hooks.update", "orgs.hooks.config.update", "repos.hooks.config.update",
  "orgs.update", "pull_requests.requested_reviewers.add", "pull_requests.requested_reviewers.remove",
  "repos.update", "user.update",
];

describe("github FIX-EFFECTS-c: kept set is exactly 26 (27 after EFFECTS-c; TR-1 amend omits repos.interaction_limits.set)", () => {
  test("RECONCILE_KEEP and the manifest's effect-key ops equal the literal kept set", () => {
    expect(Object.keys(KEPT_EXACT)).toHaveLength(26);
    expect({ ...RECONCILE_KEEP }).toEqual({ ...KEPT_EXACT });
    const withKeys = Object.keys(ops).filter((key) => effectKeys(ops[key]!).length > 0).sort();
    expect(withKeys).toEqual(Object.keys(KEPT_EXACT).sort());
    for (const [key, observe] of Object.entries(KEPT_EXACT)) {
      expect(ops[key]!.effectPolicy, key).toBe("Reconcile");
      expect(ops[key]!.reconcile, key).toBe(observe);
    }
  });
  test("the 13 omitted ops carry no effect keys and say why", () => {
    expect(EFFECTS_C_OMIT).toHaveLength(13);
    for (const key of EFFECTS_C_OMIT) {
      expect(effectKeys(ops[key]!), key).toEqual([]);
      expect(key in RECONCILE_KEEP, key).toBe(false);
      expect(String(ops[key]!.description), key).toContain("No effectPolicy and no reconcile");
      expect(String(ops[key]!.description), key).not.toMatch(/effectPolicy Reconcile/i);
    }
  });
  test("GH-TYPED-READS TR-1 amend (linus): repos.interaction_limits.set omits and says why", () => {
    const op = ops["repos.interaction_limits.set"]!;
    expect(effectKeys(op)).toEqual([]);
    expect("repos.interaction_limits.set" in RECONCILE_KEEP).toBe(false);
    expect(String(op.description)).toContain("No effectPolicy and no reconcile");
    expect(String(op.description)).toContain("expires_at");
    expect(String(op.description)).not.toMatch(/effectPolicy Reconcile/i);
    expect(Object.keys(op.inputSchema.properties)).toContain("expiry");
  });
  test("every hooks update/config op accepts the write-only secret (reason for omit)", () => {
    for (const key of ["orgs.hooks.update", "repos.hooks.update", "orgs.hooks.config.update", "repos.hooks.config.update"]) {
      expect(Object.keys(ops[key]!.inputSchema.properties), key).toContain("secret");
    }
  });
});

describe("github FIX-EFFECTS-c: kept-op field mappings (observe reads back every writable field)", () => {
  // GitHub review state after a submit event (REST "Submit a review for a pull request"):
  // APPROVE -> APPROVED, REQUEST_CHANGES -> CHANGES_REQUESTED, COMMENT -> COMMENTED.
  const EVENT_STATE: Record<string, string> = { APPROVE: "APPROVED", REQUEST_CHANGES: "CHANGES_REQUESTED", COMMENT: "COMMENTED" };
  test("pull_requests.reviews.submit writes event + body; reviews.get reads them back as state + body on the same reviewId", async () => {
    expect(Object.keys(ops["pull_requests.reviews.submit"]!.inputSchema.properties).sort()).toEqual(["body", "event", "owner", "pullNumber", "repo", "reviewId"]);
    expect(ops["pull_requests.reviews.submit"]!.inputSchema.properties.event.enum).toEqual(Object.keys(EVENT_STATE));
    for (const [event, state] of Object.entries(EVENT_STATE)) {
      const calls: string[] = [];
      let sent: Record<string, unknown> = {};
      const review = { id: 55, state, body: `body-${event}`, user: { login: "rev" }, html_url: "https://h", submitted_at: "2026-01-01T00:00:00Z" };
      const fetch = (async (url: unknown, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        calls.push(`${method} ${String(url)}`);
        if (method === "POST") sent = JSON.parse(String(init?.body));
        return Response.json(review);
      }) as unknown as typeof globalThis.fetch;
      const result = defaultConnectorRegistry.executeAction("github", "pull_requests.reviews.submit", { owner: "o", repo: "r", pullNumber: 3, reviewId: 55, event, body: `body-${event}`, accessToken: "t", fetch });
      if (!result.ok) throw new Error(JSON.stringify(result));
      const output = (await Promise.resolve(result.output)) as { action: string; review: { state: string; body: string; providerReviewId: number } };
      expect(calls).toEqual([
        "POST https://api.github.com/repos/o/r/pulls/3/reviews/55/events",
        "GET https://api.github.com/repos/o/r/pulls/3/reviews/55",
      ]);
      expect(sent).toEqual({ event, body: `body-${event}` });
      expect(output.action).toBe("pull_requests.reviews.get");
      expect(output.review.providerReviewId).toBe(55);
      expect(output.review.state).toBe(EVENT_STATE[sent.event as string]);
      expect(output.review.body).toBe(sent.body);
      expect(schemaErrors(output, ops["pull_requests.reviews.submit"]!.outputSchema)).toEqual([]);
    }
  });
  test("releases.update writes 6 fields; releases.get reads all 6 back (targetCommitish -> targetBranch) on the same releaseId", async () => {
    const writable = Object.keys(ops["releases.update"]!.inputSchema.properties).filter((k) => !["owner", "repo", "releaseId"].includes(k)).sort();
    expect(writable).toEqual(["body", "draft", "name", "prerelease", "tagName", "targetCommitish"]);
    const input = { tagName: "v9.9.9", name: "Nine", body: "notes", draft: true, prerelease: true, targetCommitish: "release/9" };
    const calls: string[] = [];
    let sent: Record<string, unknown> = {};
    const fetch = (async (url: unknown, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push(`${method} ${String(url)}`);
      if (method === "PATCH") sent = JSON.parse(String(init?.body));
      return Response.json({ id: 77, html_url: "https://h", default_branch: "main", ...sent });
    }) as unknown as typeof globalThis.fetch;
    const result = defaultConnectorRegistry.executeAction("github", "releases.update", { owner: "o", repo: "r", releaseId: 77, ...input, accessToken: "t", fetch });
    if (!result.ok) throw new Error(JSON.stringify(result));
    const output = (await Promise.resolve(result.output)) as { action: string; release: Record<string, unknown> };
    expect(calls).toEqual(["PATCH https://api.github.com/repos/o/r/releases/77", "GET https://api.github.com/repos/o/r/releases/77"]);
    expect(sent).toEqual({ tag_name: "v9.9.9", name: "Nine", body: "notes", draft: true, prerelease: true, target_commitish: "release/9" });
    expect(output.action).toBe("releases.get");
    expect(output.release.providerReleaseId).toBe(77);
    const readBack: Record<string, string> = { tagName: "tagName", name: "name", body: "body", draft: "draft", prerelease: "prerelease", targetCommitish: "targetBranch" };
    expect(Object.keys(readBack).sort()).toEqual(writable);
    for (const [field, outKey] of Object.entries(readBack)) expect(output.release[outKey], field).toEqual(input[field as keyof typeof input]);
    expect(schemaErrors(output, ops["releases.update"]!.outputSchema)).toEqual([]);
    // FIX-EFFECTS-c amend (linus): read-backs are judged from the DECLARED output schemas. Close
    // `release` (additionalProperties:false) on copies of the releases.get and releases.update
    // schemas and validate the release restricted to the declared keys plus every read-back key
    // (and providerReleaseId, the same-id check): an undeclared read-back key fails as "not
    // declared", a declared key the handler does not return fails as "missing".
    const direct = defaultConnectorRegistry.executeAction("github", "releases.get", { owner: "o", repo: "r", releaseId: 77, accessToken: "t", fetch });
    if (!direct.ok) throw new Error(JSON.stringify(direct));
    const observed = (await Promise.resolve(direct.output)) as { release: Record<string, unknown> };
    const mustDeclare = [...Object.values(readBack), "providerReleaseId"];
    for (const op of ["releases.get", "releases.update"]) {
      const closed = structuredClone(ops[op]!.outputSchema);
      closed.properties.release.additionalProperties = false;
      const declared = Object.keys(closed.properties.release.properties);
      expect(declared, op).toEqual(expect.arrayContaining(mustDeclare));
      for (const release of [output.release, observed.release]) {
        const keys = [...new Set([...declared, ...mustDeclare])];
        const projected = { release: Object.fromEntries(keys.map((k) => [k, release[k]])) };
        expect(schemaErrors(projected, closed), op).toEqual([]);
      }
    }
    expect(ops["releases.get"]!.outputSchema.properties.release.properties).toEqual(ops["releases.update"]!.outputSchema.properties.release.properties);
    expect(ops["releases.get"]!.outputSchema.properties.release.properties).toMatchObject({
      // GH-TYPED-READS (0.86.6): integer id; body and targetBranch nullable (never "" / "main").
      // FIX-DESTRUCTIVE amend 2: providerReleaseId nullable (null for a non-numeric id, never 0).
      providerReleaseId: { type: ["integer", "null"] }, body: { type: ["string", "null"] }, draft: { type: "boolean" }, prerelease: { type: "boolean" }, targetBranch: { type: ["string", "null"] },
    });
  });

  test("releases normalizer returns the declared types even for a malformed upstream body", async () => {
    const fetch = (async () => Response.json({ id: "77", body: null, draft: "yes", prerelease: 1, target_commitish: 5, tag_name: "v1", html_url: "https://h" })) as unknown as typeof globalThis.fetch;
    const r = defaultConnectorRegistry.executeAction("github", "releases.get", { owner: "o", repo: "r", releaseId: 77, accessToken: "t", fetch });
    if (!r.ok) throw new Error(JSON.stringify(r));
    const out = (await Promise.resolve(r.output)) as { release: Record<string, unknown> };
    expect(schemaErrors(out, ops["releases.get"]!.outputSchema)).toEqual([]);
    // GH-TYPED-READS (0.86.6): body (nullable upstream) and targetBranch (linus: never "main") are null.
    // FIX-DESTRUCTIVE amend 2: providerReleaseId is null for a non-numeric id (was a fabricated 0).
    expect([out.release.providerReleaseId, out.release.body, out.release.draft, out.release.prerelease, out.release.targetBranch]).toEqual([null, null, false, false, null]);
  });
});
