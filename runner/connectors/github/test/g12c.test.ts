import { describe, expect, test } from "bun:test";
import { mutating } from "./destructive_keys";
import manifest from "../manifest.json";
import * as actions from "../src/actions";
import { defaultConnectorRegistry } from "../../../bun/src/registry";
import {
  G12C_REQUIRED_SCOPES,
  validateSearchGraphqlInput,
  validateSetUserInteractionLimitInput,
  validateUpdateUserListInput,
  validateUpdateUserListsForItemInput,
  validateUpdateUserStatusInput,
} from "../src/gap_g12c";

// FIX-G12C: the 12 G12 GraphQL ops run through src/graphql.ts gqlRequest.

const OPS: Record<string, keyof typeof actions> = {
  "graphql.search": "searchGraphql",
  "graphql.sponsorables.list": "listGraphqlSponsorables",
  "graphql.enterprise.member_invitation.get": "getEnterpriseMemberInvitation",
  "graphql.enterprise.admin_invitation.get": "getEnterpriseAdminInvitation",
  "graphql.organizations.follow": "followOrganizationGraphql",
  "graphql.organizations.unfollow": "unfollowOrganizationGraphql",
  "graphql.user_status.update": "updateUserStatusGraphql",
  "graphql.interaction_limits.set_user": "setUserInteractionLimitGraphql",
  "graphql.user_lists.create": "createUserListGraphql",
  "graphql.user_lists.update": "updateUserListGraphql",
  "graphql.user_lists.delete": "deleteUserListGraphql",
  "graphql.user_lists.items.update": "updateUserListsForItemGraphql",
};
const READS = new Set([
  "graphql.search",
  "graphql.sponsorables.list",
  "graphql.enterprise.member_invitation.get",
  "graphql.enterprise.admin_invitation.get",
]);
// FIX-EFFECTS (v0.81.2): the graphql.node.get / graphql.viewer.get observes return {found, node} /
// {viewer}, not these ops' own output ({organization}, {status}), so follow, unfollow and
// user_status.update carry no effect keys. No G12 op keeps Reconcile.
const RECONCILE: Record<string, { reconcile: string; reconcileInput?: Record<string, string> }> = {};

type Fixture = {
  operation: string;
  input: Record<string, unknown>;
  request: { method: string; url: string; root: string; headers: Record<string, string> };
  response: { status: number; body: unknown };
  expected: Record<string, unknown>;
  errorsOn200: { response: { status: number; body: unknown }; expectedError: { code: string; message: string } };
};

type Seen = { url: string; method: string; headers: Record<string, string>; body: { query: string; variables: Record<string, unknown> } };

function recorder(responses: Response[] | (() => Response)) {
  const seen: Seen[] = [];
  let i = 0;
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    seen.push({ url: String(input), method: init?.method ?? "GET", headers, body: JSON.parse(String(init?.body ?? "{}")) });
    if (typeof responses === "function") return responses();
    return responses[i++]!;
  };
  return { seen, fetch };
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

async function fixture(op: string): Promise<Fixture> {
  return (await import(`../fixtures/cases/${op.replaceAll(".", "_")}.json`)).default as Fixture;
}

function call(op: string, input: Record<string, unknown>) {
  const fn = actions[OPS[op]!] as (input: unknown) => Record<string, unknown> | Promise<Record<string, unknown>>;
  return Promise.resolve(fn(input));
}

const opsOf = manifest.operations as Record<string, Record<string, any>>;

describe("github FIX-G12C: G12 GraphQL ops via gqlRequest", () => {
  test("version 0.87.0 at 851 ops; auth.scopes unchanged (per-op scopes only)", () => {
    expect(manifest.version).toBe("0.89.4");
    expect(Object.keys(opsOf)).toHaveLength(860);
    expect(manifest.auth.scopes).toEqual(["repo", "read:org", "admin:repo_hook", "admin:org_hook", "gist", "notifications", "admin:org"]);
    expect(manifest.auth.scopes).not.toContain("user");
    expect(manifest.auth.scopes).not.toContain("read:enterprise");
  });

  test("the 12 ops are hand-written (no declarative request), with sideEffect, effect and scopes per audit §5", () => {
    for (const op of Object.keys(OPS)) {
      const spec = opsOf[op]!;
      expect(spec.request, op).toBeUndefined();
      expect(spec.sideEffect, op).toBe(READS.has(op) ? "read" : mutating(op));
      expect(spec.inputSchema.additionalProperties, op).toBe(false);
      const scopes = G12C_REQUIRED_SCOPES[op]!;
      if (scopes.length === 0) expect(spec.requiredScopes, op).toBeUndefined();
      else expect(spec.requiredScopes, op).toEqual([...scopes]);
      for (const scope of scopes) expect(String(spec.description), op).toContain(scope);
      const rec = RECONCILE[op];
      if (rec) {
        expect(spec.effectPolicy, op).toBe("Reconcile");
        expect(spec.reconcile, op).toBe(rec.reconcile);
        expect(spec.reconcileInput, op).toEqual(rec.reconcileInput);
      } else {
        expect(spec.effectPolicy, op).toBeUndefined();
        expect(spec.reconcile, op).toBeUndefined();
      }
      expect(defaultConnectorRegistry.describe("github")).toBeDefined();
    }
    expect(G12C_REQUIRED_SCOPES["graphql.enterprise.member_invitation.get"]).toEqual(["read:enterprise"]);
    expect(G12C_REQUIRED_SCOPES["graphql.organizations.follow"]).toEqual(["user:follow"]);
    expect(G12C_REQUIRED_SCOPES["graphql.organizations.unfollow"]).toEqual(["user:follow"]);
  });

  test("G11 enrichment the observes need is on main (node.get viewerIsFollowing, viewer.get status)", () => {
    expect(String(opsOf["graphql.node.get"]!.description)).toContain("viewerIsFollowing");
    expect(String(opsOf["graphql.viewer.get"]!.description)).toContain("organization { id }");
    expect(opsOf["graphql.node.get"]!.inputSchema.required).toEqual(["id"]);
  });

  for (const op of Object.keys(OPS)) {
    test(`${op}: fixture success (POST /graphql, Next-Global-ID, root selection) and errors-on-200`, async () => {
      const fx = await fixture(op);
      expect(fx.operation).toBe(op);
      const ok = recorder([json(fx.response.body, fx.response.status)]);
      const result = await call(op, { ...fx.input, accessToken: "tok", fetch: ok.fetch });
      expect(ok.seen).toHaveLength(1);
      const sent = ok.seen[0]!;
      expect(sent.method).toBe("POST");
      expect(sent.url).toBe(fx.request.url);
      expect(sent.headers["x-github-next-global-id"]).toBe("1");
      expect(sent.headers.authorization).toBe("Bearer tok");
      expect(sent.body.query).toContain(`${fx.request.root}(`);
      expect(sent.body.query).not.toContain("clientMutationId");
      expect(result).toMatchObject({ connector: "github", action: op, source: "connector", ...fx.expected });

      const bad = recorder([json(fx.errorsOn200.response.body, fx.errorsOn200.response.status)]);
      await expect(call(op, { ...fx.input, accessToken: "tok", fetch: bad.fetch })).rejects.toMatchObject(fx.errorsOn200.expectedError);
      expect(bad.seen).toHaveLength(1);
    });
  }

  test("RATE_LIMITED in errors[] → CONNECTOR_RATE_LIMITED; mutations are not retried", async () => {
    for (const op of ["graphql.search", "graphql.user_lists.create"]) {
      const fx = await fixture(op);
      const r = recorder(() => json({ data: null, errors: [{ type: "RATE_LIMITED", message: "API rate limit exceeded" }] }, 200, { "retry-after": "30" }));
      await expect(call(op, { ...fx.input, accessToken: "tok", fetch: r.fetch })).rejects.toMatchObject({
        code: "CONNECTOR_RATE_LIMITED",
        retryAfterSeconds: 30,
      });
      expect(r.seen).toHaveLength(1);
    }
  });

  test("GraphQL INSUFFICIENT_SCOPES on a requiredScopes op → CONNECTOR_CAPABILITY_MISSING (meta-ads shape), fallback to the op's scopes", async () => {
    for (const op of Object.keys(OPS)) {
      const scopes = [...G12C_REQUIRED_SCOPES[op]!];
      if (scopes.length === 0) continue;
      const fx = await fixture(op);
      const errors = [{ type: "INSUFFICIENT_SCOPES", message: "Your token has not been granted the required scopes." }];
      const r = recorder([json({ data: null, errors })]);
      const err = await call(op, { ...fx.input, accessToken: "tok", fetch: r.fetch }).catch((e) => e);
      expect(err, op).toBeInstanceOf(Error);
      expect(err, op).toMatchObject({
        ok: false,
        code: "CONNECTOR_CAPABILITY_MISSING",
        status: 200,
        reason: "permission_missing",
        missingScopes: scopes,
        requiredScopes: scopes,
        reconsentRequired: true,
        providerCode: "INSUFFICIENT_SCOPES",
        providerSubcode: null,
        providerError: errors,
      });
      expect(err.message, op).toBe(
        `GitHub ${op} is missing permission ${scopes.join(", ")}. Reconnect GitHub to re-consent with ${scopes.join(", ")} (not part of the default connect scopes).`,
      );
      expect(r.seen, op).toHaveLength(1);
    }
  });

  test("organization follow/unfollow need only user:follow (least privilege) and name it in CAPABILITY_MISSING", async () => {
    for (const op of ["graphql.organizations.follow", "graphql.organizations.unfollow"]) {
      expect(opsOf[op]!.requiredScopes, op).toEqual(["user:follow"]);
      expect(String(opsOf[op]!.description), op).toContain("Per-op scope: user:follow (least privilege");
      const fx = await fixture(op);
      const r = recorder([json({ data: null, errors: [{ type: "INSUFFICIENT_SCOPES", message: "needs user:follow" }] })]);
      const err = await call(op, { ...fx.input, accessToken: "tok", fetch: r.fetch }).catch((e) => e);
      expect(err, op).toMatchObject({ code: "CONNECTOR_CAPABILITY_MISSING", missingScopes: ["user:follow"], requiredScopes: ["user:follow"], reconsentRequired: true });
      expect(err.message, op).toBe(`GitHub ${op} is missing permission user:follow. Reconnect GitHub to re-consent with user:follow (not part of the default connect scopes).`);
      const h = recorder([json({ message: "Forbidden" }, 403, { "X-Accepted-OAuth-Scopes": "user:follow", "X-OAuth-Scopes": "repo, read:org" })]);
      await expect(call(op, { ...fx.input, accessToken: "tok", fetch: h.fetch }), op).rejects.toMatchObject({
        code: "CONNECTOR_CAPABILITY_MISSING",
        status: 403,
        missingScopes: ["user:follow"],
      });
    }
    expect(manifest.auth.scopes).not.toContain("user:follow");
  });

  test("403/404 scope headers: missing = X-Accepted-OAuth-Scopes − X-OAuth-Scopes", async () => {
    const fx = await fixture("graphql.enterprise.member_invitation.get");
    const r = recorder([
      json({ message: "Resource not accessible by integration" }, 403, {
        "X-Accepted-OAuth-Scopes": "read:enterprise, admin:enterprise",
        "X-OAuth-Scopes": "repo, read:org, admin:enterprise",
      }),
    ]);
    const err = await call("graphql.enterprise.member_invitation.get", { ...fx.input, accessToken: "tok", fetch: r.fetch }).catch((e) => e);
    expect(err).toMatchObject({
      code: "CONNECTOR_CAPABILITY_MISSING",
      status: 403,
      reason: "permission_missing",
      missingScopes: ["read:enterprise"],
      requiredScopes: ["read:enterprise"],
      reconsentRequired: true,
      providerCode: null,
      providerError: { message: "Resource not accessible by integration" },
    });
    const fx2 = await fixture("graphql.user_lists.create");
    const nf = recorder([json({ message: "Not Found" }, 404, { "x-accepted-oauth-scopes": "user, write:discussion", "x-oauth-scopes": "repo" })]);
    await expect(call("graphql.user_lists.create", { ...fx2.input, accessToken: "tok", fetch: nf.fetch })).rejects.toMatchObject({
      code: "CONNECTOR_CAPABILITY_MISSING",
      status: 404,
      missingScopes: ["user", "write:discussion"],
      requiredScopes: ["user"],
    });
  });

  test("scope headers that show nothing missing, or ops without requiredScopes, stay CONNECTOR_UPSTREAM_ERROR", async () => {
    const fx = await fixture("graphql.organizations.follow");
    const granted = recorder([json({ message: "Forbidden" }, 403, { "x-accepted-oauth-scopes": "user:follow", "x-oauth-scopes": "repo, user:follow" })]);
    await expect(call("graphql.organizations.follow", { ...fx.input, accessToken: "tok", fetch: granted.fetch })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
    const fs = await fixture("graphql.search");
    const unscoped = recorder([json({ data: null, errors: [{ type: "INSUFFICIENT_SCOPES", message: "needs repo" }] })]);
    await expect(call("graphql.search", { ...fs.input, accessToken: "tok", fetch: unscoped.fetch })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: "needs repo",
    });
  });

  test("enterprise invitations: NOT_FOUND or null → found:false", async () => {
    for (const op of ["graphql.enterprise.member_invitation.get", "graphql.enterprise.admin_invitation.get"]) {
      const fx = await fixture(op);
      const notFound = recorder([json({ data: { [fx.request.root]: null }, errors: [{ type: "NOT_FOUND", path: [fx.request.root], message: "Could not resolve" }] })]);
      expect(await call(op, { ...fx.input, accessToken: "tok", fetch: notFound.fetch })).toMatchObject({ found: false, invitation: null });
      const nul = recorder([json({ data: { [fx.request.root]: null } })]);
      expect(await call(op, { ...fx.input, accessToken: "tok", fetch: nul.fetch })).toMatchObject({ found: false, invitation: null });
    }
  });

  test("search and sponsorables page with first/after and return nodes + pageInfo", async () => {
    const s = recorder([json({ data: { search: { issueCount: 0, repositoryCount: 0, userCount: 0, discussionCount: 0, pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } } })]);
    await call("graphql.search", { query: "q", type: "ISSUE", first: 50, after: "c1", accessToken: "t", fetch: s.fetch });
    expect(s.seen[0]!.body.variables).toEqual({ query: "q", type: "ISSUE", first: 50, after: "c1" });
    expect(s.seen[0]!.body.query).toContain("pageInfo { hasNextPage endCursor");
    expect(s.seen[0]!.body.query).toContain("nodes {");
    const d = recorder([json({ data: { search: { pageInfo: {}, nodes: [] } } })]);
    await call("graphql.search", { query: "q", type: "USER", accessToken: "t", fetch: d.fetch });
    expect(d.seen[0]!.body.variables).toMatchObject({ first: 10, after: null });
    const sp = recorder([json({ data: { sponsorables: { totalCount: 0, pageInfo: {}, nodes: [] } } })]);
    await call("graphql.sponsorables.list", { first: 5, after: "x", accessToken: "t", fetch: sp.fetch });
    expect(sp.seen[0]!.body.variables).toMatchObject({ first: 5, after: "x", orderBy: { field: "LOGIN", direction: "ASC" } });
    expect(sp.seen[0]!.body.query).toContain("hasSponsorsListing");
  });

  test("mutations send the input object GitHub expects", async () => {
    const fx = await fixture("graphql.user_status.update");
    const r = recorder([json(fx.response.body)]);
    await call("graphql.user_status.update", { ...fx.input, accessToken: "t", fetch: r.fetch });
    expect(r.seen[0]!.body.variables).toEqual({ input: fx.input });
    const lim = recorder([json((await fixture("graphql.interaction_limits.set_user")).response.body)]);
    await call("graphql.interaction_limits.set_user", { userId: "U_1", limit: "NO_LIMIT", accessToken: "t", fetch: lim.fetch });
    expect(lim.seen[0]!.body.variables).toEqual({ input: { userId: "U_1", limit: "NO_LIMIT" } });
    expect(lim.seen[0]!.body.query).toContain("interactionAbility { limit expiresAt origin }");
  });

  test("validators fail closed before any request", () => {
    expect(() => validateSearchGraphqlInput({ query: "q", type: "sample" })).toThrow(/type must be one of/);
    expect(() => validateSearchGraphqlInput({ query: "q", type: "ISSUE", first: 101 })).toThrow(/first/);
    expect(() => validateUpdateUserListInput({ listId: "UL_1" })).toThrow(/at least one of/);
    expect(() => validateUpdateUserStatusInput({ message: "m", expiresAt: "2026-10-20" })).toThrow(/date-time/);
    expect(() => validateSetUserInteractionLimitInput({ userId: "U", limit: "sample" })).toThrow(/limit must be one of/);
    expect(validateUpdateUserListsForItemInput({ itemId: "R", listIds: [] })).toEqual({ itemId: "R", listIds: [] });
  });

  test("dry-run (no token) returns validated payloads", async () => {
    expect(await call("graphql.user_lists.create", { name: "x" })).toMatchObject({ validated: { name: "x" } });
  });
});

describe("FIX-G12C graphql.search strict-validation aliases", () => {
  test("conflicting name/state fields are aliased per fragment and folded back in the output", async () => {
    const r = recorder([
      json({
        data: {
          search: {
            issueCount: 2,
            pageInfo: { hasNextPage: false, endCursor: null, hasPreviousPage: false, startCursor: null },
            nodes: [
              { __typename: "Issue", id: "I_1", number: 1, title: "t", url: "u", issueState: "OPEN", createdAt: "c", repository: { nameWithOwner: "o/r" } },
              { __typename: "PullRequest", id: "PR_1", number: 2, title: "p", url: "u2", pullRequestState: "MERGED", createdAt: "c", repository: { nameWithOwner: "o/r" } },
              { __typename: "User", id: "U_1", login: "octocat", profileName: null, url: "u3" },
              { __typename: "Repository", id: "R_1", name: "Hello", nameWithOwner: "o/Hello", url: "u4", description: null, isPrivate: false, stargazerCount: 1 },
            ],
          },
        },
      }),
    ]);
    const out = (await call("graphql.search", { query: "q", type: "ISSUE", accessToken: "t", fetch: r.fetch })) as Record<string, any>;
    const doc = String(r.seen[0]!.body.query);
    expect(doc).toContain("... on Issue { id number title url issueState: state ");
    expect(doc).toContain("... on PullRequest { id number title url pullRequestState: state ");
    expect(doc).toContain("... on User { id login profileName: name url }");
    expect(doc).toContain("... on Organization { id login profileName: name url }");
    // No bare `state` / nullable `name` left to merge against String!/IssueState!.
    expect(doc).not.toMatch(/on (Issue|PullRequest) \{[^}]*\burl state\b/);
    expect(doc).not.toMatch(/on (User|Organization) \{ id login name /);
    expect(out.items).toEqual([
      { __typename: "Issue", id: "I_1", number: 1, title: "t", url: "u", state: "OPEN", createdAt: "c", repository: { nameWithOwner: "o/r" } },
      { __typename: "PullRequest", id: "PR_1", number: 2, title: "p", url: "u2", state: "MERGED", createdAt: "c", repository: { nameWithOwner: "o/r" } },
      { __typename: "User", id: "U_1", login: "octocat", name: null, url: "u3" },
      { __typename: "Repository", id: "R_1", name: "Hello", nameWithOwner: "o/Hello", url: "u4", description: null, isPrivate: false, stargazerCount: 1 },
    ]);
  });
});

describe("FIX-G12C Reconcile through the registry", () => {
  async function run(action: string, input: Record<string, unknown>, responses: Response[]) {
    const r = recorder(responses);
    const result = defaultConnectorRegistry.executeAction("github", action, { ...input, accessToken: "tok", fetch: r.fetch });
    if (!result.ok) throw new Error(JSON.stringify(result));
    return { output: (await Promise.resolve(result.output)) as Record<string, any>, seen: r.seen };
  }

  test("FIX-EFFECTS: organizations.follow / unfollow and user_status.update are one call, primary returned", async () => {
    const follow = await run("graphql.organizations.follow", { organizationId: "O_kgDOA" }, [
      json({ data: { followOrganization: { organization: { id: "O_kgDOA", login: "github", viewerIsFollowing: true } } } }),
    ]);
    expect(follow.seen).toHaveLength(1);
    expect(follow.seen[0]!.body.query).toContain("followOrganization(");
    expect(follow.output.action).toBe("graphql.organizations.follow");
    const unfollow = await run("graphql.organizations.unfollow", { organizationId: "O_kgDOA" }, [
      json({ data: { unfollowOrganization: { organization: { id: "O_kgDOA", login: "github", viewerIsFollowing: false } } } }),
    ]);
    expect(unfollow.seen).toHaveLength(1);
    expect(unfollow.output.action).toBe("graphql.organizations.unfollow");
    const fx = await fixture("graphql.user_status.update");
    const status = await run("graphql.user_status.update", fx.input, [json(fx.response.body)]);
    expect(status.seen).toHaveLength(1);
    expect(status.output.action).toBe("graphql.user_status.update");
  });

  test("user_lists.delete has no effect keys (deletes omit): one call, primary returned", async () => {
    expect(opsOf["graphql.user_lists.delete"]!.effectPolicy).toBeUndefined();
    expect(opsOf["graphql.user_lists.delete"]!.reconcile).toBeUndefined();
    const { output, seen } = await run("graphql.user_lists.delete", { listId: "UL_kwDOA" }, [
      json({ data: { deleteUserList: { user: { id: "U_kgDOA", login: "octocat" } } } }),
    ]);
    expect(seen).toHaveLength(1);
    expect(output).toMatchObject({ action: "graphql.user_lists.delete", deleted: true, listId: "UL_kwDOA" });
  });

  test("closed inputs reject unknown keys at dispatch", () => {
    const result = defaultConnectorRegistry.executeAction("github", "graphql.search", { query: "q", type: "ISSUE", bogus: 1, accessToken: "t" });
    expect(result.ok).toBe(false);
  });
});
