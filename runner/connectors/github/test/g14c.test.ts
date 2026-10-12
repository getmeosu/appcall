import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import coverage from "../fixtures/composio-coverage.json";
import prFixture from "../fixtures/pr_convert_to_draft.json";
import * as actions from "../src/actions";
import { defaultConnectorRegistry } from "../../../bun/src/registry";
import { COMMENT_EDITS_QUERY, G14C_REQUIRED_SCOPES, validateListCommentEditsInput, validateRunGraphqlMutationInput } from "../src/gap_g14c";
import { scopesNamedInErrors } from "../src/graphql";
import { graphqlOperationKinds, validateRunGraphqlQueryInput } from "../src/gap_g13c";

// FIX-G14C-PRDRAFT: graphql.mutate (+1), PR draft/ready on GraphQL, issues.labels.remove on
// DELETE, GHEC rest.x.* per-op scopes, 18 composio-coverage mapping fixes. Recorders only.

type Seen = { url: string; method: string; headers: Record<string, string>; body: Record<string, any> | null };

function recorder(responses: Response[] | (() => Response)) {
  const seen: Seen[] = [];
  let i = 0;
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    seen.push({ url: String(input), method: init?.method ?? "GET", headers, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (typeof responses === "function") return responses();
    return responses[i++]!;
  };
  return { seen, fetch };
}
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const opsOf = manifest.operations as Record<string, Record<string, any>>;
const fixture = async (op: string) => (await import(`../fixtures/cases/${op.replaceAll(".", "_")}.json`)).default as Record<string, any>;

const GHEC: Record<string, { fn: keyof typeof actions; scope: string }> = {
  "rest.x.AUDIT": { fn: "getGhecOrgAuditLog", scope: "read:audit_log" },
  "rest.x.ORG_ROLE_CREATE": { fn: "createGhecOrgRole", scope: "admin:org" },
  "rest.x.ORG_ROLE_UPDATE": { fn: "updateGhecOrgRole", scope: "admin:org" },
  "rest.x.ORG_ROLE_DELETE": { fn: "deleteGhecOrgRole", scope: "admin:org" },
  "rest.x.ORG_FINE_PERMS": { fn: "listGhecOrgFineGrainedPermissions", scope: "admin:org" },
};
const callFn = (fn: keyof typeof actions, input: Record<string, unknown>) =>
  Promise.resolve((actions[fn] as (i: unknown) => Record<string, unknown> | Promise<Record<string, unknown>>)(input));

describe("github FIX-G14C: manifest", () => {
  test("version 0.87.0 at 851 ops (+graphql.mutate, +issues.comments.edits.list); auth.scopes unchanged", () => {
    expect(manifest.version).toBe("0.88.0");
    expect(Object.keys(opsOf)).toHaveLength(855);
    expect(manifest.auth.scopes).toEqual(["repo", "read:org", "admin:repo_hook", "admin:org_hook", "gist", "notifications", "admin:org"]);
    expect(manifest.auth.scopes).not.toContain("read:audit_log");
  });

  test("graphql.mutate: destructive, no effect keys, no requiredScopes, closed body, warning, unmapped", () => {
    const op = opsOf["graphql.mutate"]!;
    expect(op.kind).toBe("action");
    expect(op.sideEffect).toBe("destructive"); // FIX-DESTRUCTIVE (0.86.5)
    expect(op.effectPolicy).toBeUndefined();
    expect(op.reconcile).toBeUndefined();
    expect(op.requiredScopes).toBeUndefined();
    expect(op.request).toBeUndefined();
    expect(op.inputSchema.additionalProperties).toBe(false);
    expect(op.inputSchema.properties.body.additionalProperties).toBe(false);
    expect(String(op.description)).toContain("WARNING: runs an arbitrary caller-supplied GraphQL mutation");
    expect(String(op.description)).toContain("CONNECTOR_CAPABILITY_MISSING");
    expect(Object.values(coverage.mapped as Record<string, string>)).not.toContain("graphql.mutate");
  });

  test("GHEC rest.x.*: keys kept, plan-gated description, per-op scope, no request block, no effect keys", () => {
    for (const [key, { scope }] of Object.entries(GHEC)) {
      const op = opsOf[key]!;
      expect(op, key).toBeDefined();
      expect(String(op.description).startsWith("GHEC plan-gated"), key).toBe(true);
      expect(String(op.description), key).toContain(scope);
      expect(String(op.description), key).toContain("CONNECTOR_CAPABILITY_MISSING");
      expect(op.requiredScopes, key).toEqual([scope]);
      expect(G14C_REQUIRED_SCOPES[key], key).toEqual([scope]);
      expect(op.request, key).toBeUndefined();
      expect(op.effectPolicy, key).toBeUndefined();
      expect(op.reconcile, key).toBeUndefined();
    }
  });

  test("PR draft ops keep Reconcile via pull_requests.get; labels.remove omits effects", () => {
    for (const key of ["pull_requests.convert_to_draft", "pull_requests.mark_ready"]) {
      expect(opsOf[key]!.effectPolicy).toBe("Reconcile");
      expect(opsOf[key]!.reconcile).toBe("pull_requests.get");
      expect(String(opsOf[key]!.description)).toContain("GraphQL");
      expect(Object.keys(opsOf[key]!.inputSchema.properties)).toEqual(["owner", "repo", "pullNumber"]);
    }
    expect(opsOf["issues.labels.remove"]!.effectPolicy).toBeUndefined();
    expect(opsOf["issues.labels.remove"]!.reconcile).toBeUndefined();
    expect(String(opsOf["issues.labels.remove"]!.description)).toContain("Not atomic:");
    expect(String(opsOf["issues.labels.remove"]!.description)).toContain("names the labels already removed");
  });

  test("composio-coverage: the 18 audited mapping fixes plus RELAY → graphql.query", () => {
    const mapped = coverage.mapped as Record<string, string>;
    const expected: Record<string, string> = {
      GITHUB_CHECK_PERSON_FOLLOWED_BY_AUTH_USER: "user.following.check",
      GITHUB_CONFIGURE_OIDC_SUBJECT_CLAIM_TEMPLATE: "orgs.actions.oidc.customization.sub.set",
      GITHUB_CREATE_OR_UPDATE_GITHUB_PAGES_SITE: "repos.pages.update",
      GITHUB_GET_CODE_OF_CONDUCT_GRAPH_QL: "graphql.codes_of_conduct.get",
      GITHUB_GET_LICENSE_GRAPH_QL: "graphql.licenses.get",
      GITHUB_GET_PAGES_SITE: "repos.pages.get",
      GITHUB_GET_PUBLIC_KEY_FOR_SECRET_ENCRYPTION: "actions.org_secrets.public_key.get",
      GITHUB_LIST_COMMENT_CHANGES: "issues.comments.edits.list",
      GITHUB_LIST_COMMONLY_USED_LICENSES: "licenses.list",
      GITHUB_LIST_ENVIRONMENT_CUSTOM_DEPLOYMENT_RULES: "repos.environments.deployment_protection_rules.apps.list",
      GITHUB_LIST_GITIGNORE_TEMPLATES: "gitignore.templates.list",
      GITHUB_LIST_ISSUE_TYPES: "repos.issue_types.list",
      GITHUB_LIST_ORGANIZATION_CODESPACES_SECRETS: "orgs.codespaces.secrets.list",
      GITHUB_LIST_PROJECT_ITEMS_FOR_USER: "users.projects_v2.items.list",
      GITHUB_LIST_REPO_CODESPACES: "repos.codespaces.list",
      GITHUB_LIST_SECURITY_VULNERABILITIES: "graphql.security_vulnerabilities.list",
      GITHUB_LIST_SUBSCRIPTIONS_FOR_THE_AUTHENTICATED_USER_STUBBED: "user.marketplace_purchases.stubbed.list",
      GITHUB_MANAGE_CUSTOM_PROPERTIES_FOR_ORG_REPOS: "orgs.properties.values.update",
    };
    expect(Object.keys(expected)).toHaveLength(18);
    for (const [slug, op] of Object.entries(expected)) {
      expect(mapped[slug], slug).toBe(op);
      expect(opsOf[op], op).toBeDefined();
    }
    expect((coverage.missing_still as Array<{ slug: string }>).map((m) => m.slug)).not.toContain("GITHUB_LIST_COMMENT_CHANGES");
    // 19th fix (linus ruling): RELAY is covered by graphql.query, not missing_still.
    expect(mapped.GITHUB_RUN_GRAPH_QL_RELAY_QUERY).toBe("graphql.query");
    expect((coverage.missing_still as Array<{ slug: string }>).map((m) => m.slug)).not.toContain("GITHUB_RUN_GRAPH_QL_RELAY_QUERY");
    expect(Object.keys(mapped).length + coverage.missing_still.length).toBe(897);
    expect(Object.keys(mapped)).toHaveLength(827); // PRUNE-2: GITHUB_GET_TEAM_MEMBERS left mapped (860); PRUNE-3: 10 Classroom/Source Imports slugs to missing_still, GITHUB_GET_TEAM_MEMBERS -> teams.members.list (851); PRUNE-4: 16 second-auth app / GitHub Models slugs to missing_still (835); PRUNE-5: 6 GitHub-Apps-only PAT-admin slugs to missing_still (829); D1 (0.87.0): DELETE_DISCUSSION + DELETE_DISCUSSION_COMMENT to missing_still (team discussions per Composio schema) (827)
  });
});

describe("github FIX-G14C: graphql.mutate", () => {
  test("accepts mutation documents (fragments, comments, strings) and rejects query/subscription before HTTP", () => {
    expect(validateRunGraphqlMutationInput({ body: { query: "mutation { a }" } }).query).toBe("mutation { a }");
    expect(() =>
      validateRunGraphqlMutationInput({ body: { query: '# query\nmutation M { a(s: "query { x }") { ...F } } fragment F on X { id }' } }),
    ).not.toThrow();
    for (const query of [
      "{ viewer { login } }",
      "query Q { viewer { login } }",
      "subscription S { x }",
      "mutation M { a } query Q { b }",
      "mutation M { a } subscription S { b }",
      "fragment F on X { id }",
    ]) {
      expect(() => validateRunGraphqlMutationInput({ body: { query } }), query).toThrow();
    }
    expect(() => validateRunGraphqlMutationInput({ body: { query: "mutation { a }", extensions: {} } })).toThrow("body.extensions is not allowed");
    expect(() => validateRunGraphqlMutationInput({ body: { query: "mutation { a" } })).toThrow();
  });

  test("top-level strings cannot smuggle a query past the mutation-only check (zero fetches)", async () => {
    for (const body of [
      { query: 'mutation{a} "desc" query{x}' },
      { query: 'mutation{a} """d""" query Q{x}', operationName: "Q" },
      { query: 'mutation{a} "d" subscription S{x}', operationName: "S" },
    ]) {
      expect(() => validateRunGraphqlMutationInput({ body }), body.query).toThrow(/top-level string or block string/);
      const none = recorder(() => {
        throw new Error("must not fetch");
      });
      await expect(callFn("runGraphqlMutation", { body, accessToken: "tok", fetch: none.fetch })).rejects.toThrow(/top-level string or block string/);
      expect(none.seen).toHaveLength(0);
    }
  });

  test("a rejected document makes no HTTP call", async () => {
    const r = recorder(() => json({}));
    await expect(
      callFn("runGraphqlMutation", { body: { query: "query Q { viewer { login } }" }, accessToken: "tok", fetch: r.fetch }),
    ).rejects.toThrow("graphql.mutate runs mutations only");
    expect(r.seen).toHaveLength(0);
  });

  test("fixture success: one POST /graphql with query, variables, operationName and Next-Global-ID", async () => {
    const fx = await fixture("graphql.mutate");
    const r = recorder([json(fx.response.body)]);
    const result = await callFn("runGraphqlMutation", { ...fx.input, accessToken: "tok", fetch: r.fetch });
    expect(r.seen).toHaveLength(1);
    expect(r.seen[0]!.method).toBe("POST");
    expect(r.seen[0]!.url).toBe(fx.request.url);
    expect(r.seen[0]!.headers["x-github-next-global-id"]).toBe("1");
    expect(r.seen[0]!.body).toEqual(fx.input.body);
    expect(result).toMatchObject({ action: "graphql.mutate", ...fx.expected });
  });

  test("errors on HTTP 200 (NOT_FOUND included) → CONNECTOR_UPSTREAM_ERROR; RATE_LIMITED → CONNECTOR_RATE_LIMITED; never retried", async () => {
    const fx = await fixture("graphql.mutate");
    const e = recorder([json(fx.errorsOn200.response.body)]);
    await expect(callFn("runGraphqlMutation", { ...fx.input, accessToken: "tok", fetch: e.fetch })).rejects.toMatchObject(fx.errorsOn200.expectedError);
    expect(e.seen).toHaveLength(1);
    const rl = recorder([json({ errors: [{ type: "RATE_LIMITED", message: "slow down" }] }, 200, { "retry-after": "30" })]);
    await expect(callFn("runGraphqlMutation", { ...fx.input, accessToken: "tok", fetch: rl.fetch })).rejects.toMatchObject({
      code: "CONNECTOR_RATE_LIMITED",
      retryAfterSeconds: 30,
    });
    const bad = recorder(() => json({ message: "Bad gateway" }, 502));
    await expect(callFn("runGraphqlMutation", { ...fx.input, accessToken: "tok", fetch: bad.fetch })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    expect(bad.seen).toHaveLength(1);
  });

  test("errors with non-null data surface partialData (possible partial write); all-null data does not", async () => {
    const body = {
      data: { a: { starrable: { id: "R_1", viewerHasStarred: true } }, b: null },
      errors: [{ type: "NOT_FOUND", path: ["b"], message: "Could not resolve to a node with the global id of 'R_2'" }],
    };
    const r = recorder([json(body)]);
    const err = await callFn("runGraphqlMutation", {
      body: { query: 'mutation { a: addStar(input: {starrableId: "R_1"}) { starrable { id viewerHasStarred } } b: addStar(input: {starrableId: "R_2"}) { starrable { id } } }' },
      accessToken: "tok",
      fetch: r.fetch,
    }).catch((e) => e);
    expect(err).toEqual({
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: "Could not resolve to a node with the global id of 'R_2'",
      retryAfterSeconds: undefined,
      partialData: body.data,
    });
    expect(r.seen).toHaveLength(1);
    const fx = await fixture("graphql.mutate");
    const none = recorder([json(fx.errorsOn200.response.body)]);
    const err2 = await callFn("runGraphqlMutation", { ...fx.input, accessToken: "tok", fetch: none.fetch }).catch((e) => e);
    expect(err2.partialData).toBeUndefined();
  });

  test("INSUFFICIENT_SCOPES → CONNECTOR_CAPABILITY_MISSING with scopes named by the error", async () => {
    const fx = await fixture("graphql.mutate");
    const r = recorder([json(fx.insufficientScopes.response.body)]);
    const err = await callFn("runGraphqlMutation", { ...fx.input, accessToken: "tok", fetch: r.fetch }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).toMatchObject({ ok: false, ...fx.insufficientScopes.expectedError, providerCode: "INSUFFICIENT_SCOPES" });
    expect(err.message).toBe(
      "GitHub graphql.mutate is missing permission public_repo, repo. Reconnect GitHub to re-consent with public_repo, repo (not part of the default connect scopes).",
    );
  });

  test("INSUFFICIENT_SCOPES without named scopes is still CAPABILITY_MISSING (empty missingScopes)", async () => {
    const r = recorder([json({ data: null, errors: [{ type: "INSUFFICIENT_SCOPES", message: "Your token has not been granted the required scopes." }] })]);
    const err = await callFn("runGraphqlMutation", { body: { query: "mutation { a }" }, accessToken: "tok", fetch: r.fetch }).catch((e) => e);
    expect(err).toMatchObject({ code: "CONNECTOR_CAPABILITY_MISSING", missingScopes: [], requiredScopes: [], reconsentRequired: true });
    expect(err.message).toContain("Reconnect GitHub");
  });

  test("a 403 with a scope-header diff is CAPABILITY_MISSING with the header scopes", async () => {
    const r = recorder([json({ message: "Forbidden" }, 403, { "x-accepted-oauth-scopes": "admin:org, repo", "x-oauth-scopes": "repo" })]);
    const err = await callFn("runGraphqlMutation", { body: { query: "mutation { a }" }, accessToken: "tok", fetch: r.fetch }).catch((e) => e);
    expect(err).toMatchObject({ code: "CONNECTOR_CAPABILITY_MISSING", status: 403, missingScopes: ["admin:org"] });
  });

  test("scopesNamedInErrors parses GitHub's INSUFFICIENT_SCOPES message", () => {
    expect(
      scopesNamedInErrors([
        { type: "INSUFFICIENT_SCOPES", message: "The 'a' field requires one of the following scopes: ['read:org'], but your token has only been granted the: ['repo'] scopes." },
        { type: "INSUFFICIENT_SCOPES", message: "The 'b' field requires one of the following scopes: ['read:org', \"write:org\"]" },
        { type: "NOT_FOUND", message: "requires one of the following scopes: ['x']" },
      ]),
    ).toEqual(["read:org", "write:org"]);
  });

  test("graphql.query is unchanged: still read-only and rejects mutations", async () => {
    expect(opsOf["graphql.query"]!.sideEffect).toBe("read");
    const r = recorder(() => json({}));
    await expect(callFn("runGraphqlQuery", { body: { query: "mutation { a }" }, accessToken: "tok", fetch: r.fetch })).rejects.toThrow();
    expect(r.seen).toHaveLength(0);
  });
});

describe("github FIX-G14C: issues.comments.edits.list", () => {
  test("manifest: read, closed input, no effect keys, typed output, maps LIST_COMMENT_CHANGES", () => {
    const op = opsOf["issues.comments.edits.list"]!;
    expect(op.kind).toBe("action");
    expect(op.sideEffect).toBe("read");
    expect(op.effectPolicy).toBeUndefined();
    expect(op.reconcile).toBeUndefined();
    expect(op.requiredScopes).toBeUndefined();
    expect(op.request).toBeUndefined();
    expect(op.inputSchema.additionalProperties).toBe(false);
    expect(op.inputSchema.required).toEqual(["commentId"]);
    expect(Object.keys(op.inputSchema.properties)).toEqual(["commentId", "first", "after"]);
    expect(Object.keys(op.outputSchema.properties.items.items.properties)).toEqual(["id", "editedAt", "createdAt", "deletedAt", "editorLogin", "deletedByLogin", "diff"]);
    expect((coverage.mapped as Record<string, string>).GITHUB_LIST_COMMENT_CHANGES).toBe("issues.comments.edits.list");
  });

  test("validator: commentId required, first 1-100 (default 30), after optional", () => {
    expect(validateListCommentEditsInput({ commentId: "IC_1" })).toEqual({ commentId: "IC_1", first: 30 });
    expect(validateListCommentEditsInput({ commentId: "IC_1", first: 100, after: "c" })).toEqual({ commentId: "IC_1", first: 100, after: "c" });
    for (const bad of [{}, { commentId: "" }, { commentId: "IC_1", first: 0 }, { commentId: "IC_1", first: 101 }, { commentId: "IC_1", first: 1.5 }, { commentId: "IC_1", after: "" }]) {
      expect(() => validateListCommentEditsInput(bad), JSON.stringify(bad)).toThrow();
    }
    expect(COMMENT_EDITS_QUERY).toContain("... on IssueComment {");
    expect(COMMENT_EDITS_QUERY).toContain("... on PullRequestReviewComment {");
    expect(COMMENT_EDITS_QUERY).toContain("userContentEdits(first: $first, after: $after)");
  });

  test("fixture success: one POST /graphql node(id) with paging variables; normalized items + pageInfo", async () => {
    const fx = await fixture("issues.comments.edits.list");
    const r = recorder([json(fx.response.body)]);
    const result = await callFn("listIssueCommentEdits", { ...fx.input, accessToken: "tok", fetch: r.fetch });
    expect(r.seen).toHaveLength(1);
    expect(r.seen[0]!.method).toBe("POST");
    expect(r.seen[0]!.url).toBe(fx.request.url);
    expect(r.seen[0]!.headers["x-github-next-global-id"]).toBe("1");
    expect(r.seen[0]!.body!.variables).toEqual({ id: "IC_kwDOA", first: 2, after: null });
    expect(result).toEqual({ connector: "github", action: "issues.comments.edits.list", source: "connector", ...fx.expected });
    const next = recorder([json(fx.response.body)]);
    await callFn("listIssueCommentEdits", { commentId: "IC_kwDOA", after: "Y3Vyc29yOjI=", accessToken: "tok", fetch: next.fetch });
    expect(next.seen[0]!.body!.variables).toEqual({ id: "IC_kwDOA", first: 30, after: "Y3Vyc29yOjI=" });
  });

  test("errors on HTTP 200 → CONNECTOR_UPSTREAM_ERROR (fixture)", async () => {
    const fx = await fixture("issues.comments.edits.list");
    const r = recorder([json(fx.errorsOn200.response.body)]);
    await expect(callFn("listIssueCommentEdits", { ...fx.input, accessToken: "tok", fetch: r.fetch })).rejects.toMatchObject(fx.errorsOn200.expectedError);
  });

  test("NOT_FOUND or null node → found:false; PullRequestReviewComment works; other node types are upstream errors", async () => {
    const nf = recorder([json({ data: { node: null }, errors: [{ type: "NOT_FOUND", path: ["node"], message: "Could not resolve to a node" }] })]);
    expect(await callFn("listIssueCommentEdits", { commentId: "IC_x", accessToken: "tok", fetch: nf.fetch })).toMatchObject({
      found: false,
      items: [],
      totalCount: 0,
      pageInfo: { hasNextPage: false, endCursor: null },
    });
    const nul = recorder([json({ data: { node: null } })]);
    expect(await callFn("listIssueCommentEdits", { commentId: "IC_x", accessToken: "tok", fetch: nul.fetch })).toMatchObject({ found: false });
    const prc = recorder([
      json({ data: { node: { __typename: "PullRequestReviewComment", id: "PRRC_1", url: "u", userContentEdits: { totalCount: 0, pageInfo: {}, nodes: [] } } } }),
    ]);
    expect(await callFn("listIssueCommentEdits", { commentId: "PRRC_1", accessToken: "tok", fetch: prc.fetch })).toMatchObject({
      found: true,
      commentType: "PullRequestReviewComment",
      items: [],
    });
    const issue = recorder([json({ data: { node: { __typename: "Issue" } } })]);
    await expect(callFn("listIssueCommentEdits", { commentId: "I_1", accessToken: "tok", fetch: issue.fetch })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: expect.stringContaining("Issue node"),
    });
  });

  test("through the registry: closed input, no observe", async () => {
    expect(defaultConnectorRegistry.executeAction("github", "issues.comments.edits.list", { commentId: "IC_1", bogus: 1, accessToken: "t" }).ok).toBe(false);
    const fx = await fixture("issues.comments.edits.list");
    const r = recorder([json(fx.response.body)]);
    const result = defaultConnectorRegistry.executeAction("github", "issues.comments.edits.list", { ...fx.input, accessToken: "tok", fetch: r.fetch });
    if (!result.ok) throw new Error(JSON.stringify(result));
    expect(await Promise.resolve(result.output)).toMatchObject({ action: "issues.comments.edits.list", found: true, totalCount: 3 });
    expect(r.seen).toHaveLength(1);
  });
});

describe("github FIX-G14C: GHEC rest.x.* with per-op scopes", () => {
  for (const [key, { fn, scope }] of Object.entries(GHEC)) {
    test(`${key}: documented route, { data } output, 403 scope diff → CAPABILITY_MISSING`, async () => {
      const fx = await fixture(key);
      const ok = recorder([json(fx.response.body, fx.response.status)]);
      const result = await callFn(fn, { ...fx.input, accessToken: "tok", fetch: ok.fetch });
      expect(ok.seen).toHaveLength(1);
      expect(ok.seen[0]!.method).toBe(fx.request.method);
      expect(ok.seen[0]!.url).toBe(fx.request.url);
      expect(ok.seen[0]!.body === null ? null : JSON.stringify(ok.seen[0]!.body)).toBe(fx.request.body);
      expect(result).toMatchObject({ connector: "github", action: key, data: fx.response.status === 204 ? null : fx.response.body });

      const denied = recorder([json({ message: "Must have admin rights" }, 403, { "X-Accepted-OAuth-Scopes": scope, "X-OAuth-Scopes": "repo, read:org" })]);
      const err = await callFn(fn, { ...fx.input, accessToken: "tok", fetch: denied.fetch }).catch((e) => e);
      expect(err).toBeInstanceOf(Error);
      expect(err).toMatchObject({
        ok: false,
        code: "CONNECTOR_CAPABILITY_MISSING",
        status: 403,
        reason: "permission_missing",
        missingScopes: [scope],
        requiredScopes: [scope],
        reconsentRequired: true,
      });
      expect(err.message).toBe(`GitHub ${key} is missing permission ${scope}. Reconnect GitHub to re-consent with ${scope} (not part of the default connect scopes).`);
    });
  }

  test("404 with the scope granted is an upstream error naming the GHEC plan; DELETE 404 too", async () => {
    const r = recorder([json({ message: "Not Found" }, 404, { "X-Accepted-OAuth-Scopes": "read:audit_log", "X-OAuth-Scopes": "read:audit_log, repo" })]);
    await expect(callFn("getGhecOrgAuditLog", { org: "octo", accessToken: "tok", fetch: r.fetch })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: expect.stringContaining("GitHub Enterprise Cloud"),
    });
    const d = recorder([json({ message: "Not Found" }, 404)]);
    await expect(callFn("deleteGhecOrgRole", { org: "octo", role_id: 7, accessToken: "tok", fetch: d.fetch })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
    expect(d.seen).toHaveLength(1);
  });

  test("audit-log query params are passed only when given; rate limit maps", async () => {
    const r = recorder([json([])]);
    await callFn("getGhecOrgAuditLog", { org: "octo", phrase: "action:repo.create", per_page: 50, accessToken: "tok", fetch: r.fetch });
    expect(r.seen[0]!.url).toBe("https://api.github.com/orgs/octo/audit-log?phrase=action%3Arepo.create&per_page=50");
    const rl = recorder([json({ message: "rate" }, 429, { "retry-after": "12" })]);
    await expect(callFn("listGhecOrgFineGrainedPermissions", { org: "octo", accessToken: "tok", fetch: rl.fetch })).rejects.toMatchObject({
      code: "CONNECTOR_RATE_LIMITED",
    });
  });
});

describe("FIX-G14C through the registry", () => {
  test("convert_to_draft: GET node id, GraphQL mutation, then Reconcile via pull_requests.get (exact draft)", async () => {
    const r = recorder([
      json({ ...prFixture, draft: false, node_id: "PR_kwDOabc" }),
      json({ data: { convertPullRequestToDraft: { pullRequest: { id: "PR_kwDOabc", isDraft: true, state: "OPEN", updatedAt: "2026-10-12T00:00:00Z" } } } }),
      json({ ...prFixture, draft: true, node_id: "PR_kwDOabc" }),
    ]);
    const result = defaultConnectorRegistry.executeAction("github", "pull_requests.convert_to_draft", {
      owner: "acme",
      repo: "app",
      pullNumber: 20,
      accessToken: "tok",
      fetch: r.fetch,
    });
    if (!result.ok) throw new Error(JSON.stringify(result));
    const output = (await Promise.resolve(result.output)) as Record<string, any>;
    expect(r.seen.map((s) => `${s.method} ${s.url}`)).toEqual([
      "GET https://api.github.com/repos/acme/app/pulls/20",
      "POST https://api.github.com/graphql",
      "GET https://api.github.com/repos/acme/app/pulls/20",
    ]);
    expect(r.seen[1]!.body!.query).toContain("convertPullRequestToDraft");
    expect(output).toMatchObject({ action: "pull_requests.get", pullRequest: { isDraft: true } });
  });

  test("mark_ready never calls the REST ready_for_review route", async () => {
    const r = recorder([
      json({ ...prFixture, draft: true, node_id: "PR_kwDOabc" }),
      json({ data: { markPullRequestReadyForReview: { pullRequest: { id: "PR_kwDOabc", isDraft: false, state: "OPEN", updatedAt: "2026-10-12T00:00:00Z" } } } }),
      json({ ...prFixture, draft: false, node_id: "PR_kwDOabc" }),
    ]);
    const result = defaultConnectorRegistry.executeAction("github", "pull_requests.mark_ready", {
      owner: "acme",
      repo: "app",
      pullNumber: 20,
      accessToken: "tok",
      fetch: r.fetch,
    });
    if (!result.ok) throw new Error(JSON.stringify(result));
    const output = (await Promise.resolve(result.output)) as Record<string, any>;
    expect(r.seen.some((s) => s.url.includes("ready_for_review"))).toBe(false);
    expect(output).toMatchObject({ action: "pull_requests.get", pullRequest: { isDraft: false } });
  });

  test("issues.labels.remove: DELETE per label, no observe, primary returned", async () => {
    const r = recorder([json([{ name: "enhancement" }])]);
    const result = defaultConnectorRegistry.executeAction("github", "issues.labels.remove", {
      owner: "acme",
      repo: "app",
      issueNumber: 5,
      labels: ["needs triage"],
      accessToken: "tok",
      fetch: r.fetch,
    });
    if (!result.ok) throw new Error(JSON.stringify(result));
    expect(await Promise.resolve(result.output)).toMatchObject({ action: "issues.labels.remove", labels: ["enhancement"] });
    expect(r.seen.map((s) => `${s.method} ${s.url}`)).toEqual(["DELETE https://api.github.com/repos/acme/app/issues/5/labels/needs%20triage"]);
  });

  test("graphql.mutate and rest.x.ORG_ROLE_DELETE: one call, no observe", async () => {
    const m = recorder([json({ data: { addStar: { starrable: { id: "R_1" } } } })]);
    const mr = defaultConnectorRegistry.executeAction("github", "graphql.mutate", {
      body: { query: "mutation { addStar(input: { starrableId: \"R_1\" }) { starrable { id } } }" },
      accessToken: "tok",
      fetch: m.fetch,
    });
    if (!mr.ok) throw new Error(JSON.stringify(mr));
    expect(await Promise.resolve(mr.output)).toMatchObject({ action: "graphql.mutate", data: { addStar: { starrable: { id: "R_1" } } } });
    expect(m.seen).toHaveLength(1);
    const d = recorder([json(null, 204)]);
    const dr = defaultConnectorRegistry.executeAction("github", "rest.x.ORG_ROLE_DELETE", { org: "octo", role_id: 7, accessToken: "tok", fetch: d.fetch });
    if (!dr.ok) throw new Error(JSON.stringify(dr));
    expect(await Promise.resolve(dr.output)).toMatchObject({ action: "rest.x.ORG_ROLE_DELETE", data: null });
    expect(d.seen).toHaveLength(1);
  });

  test("graphql.mutate closed body rejects unknown keys at dispatch", () => {
    const result = defaultConnectorRegistry.executeAction("github", "graphql.mutate", { body: { query: "mutation { a }", foo: 1 }, accessToken: "t" });
    expect(result.ok).toBe(false);
  });
});

describe("github FIX-G14C amend: shared parser handles object/list default values and directives", () => {
  const noFetch = () =>
    recorder(() => {
      throw new Error("must not fetch");
    });

  test("query Q($v: I = {a:1}) @d {a} is one query: graphql.query sends it (one fetch)", async () => {
    const query = "query Q($v: I = {a:1}) @d {a}";
    expect(graphqlOperationKinds(query)).toEqual(["query"]);
    expect(graphqlOperationKinds("query Q($v: [I] = [{a: [1, {b: {c: 2}}]}], $w: J = {x: \"}\"}) @d(e: {f: [1]}) @g {a}")).toEqual(["query"]);
    expect(graphqlOperationKinds("query A($v: I = {a:1}) @d {a} query B($w: I = [{b:2}]) @e {b}")).toEqual(["query", "query"]);
    const r = recorder([json({ data: { a: 1 } })]);
    await callFn("runGraphqlQuery", { body: { query }, accessToken: "tok", fetch: r.fetch });
    expect(r.seen).toHaveLength(1);
    expect(r.seen[0]!.body).toEqual({ query, variables: {} });
  });

  test("mutation M($v: I = {a:[1,{b:2}]}) @d {x}: graphql.mutate sends it, graphql.query rejects it with 0 fetches", async () => {
    const query = "mutation M($v: I = {a:[1,{b:2}]}) @d {x}";
    expect(graphqlOperationKinds(query)).toEqual(["mutation"]);
    const r = recorder([json({ data: { x: true } })]);
    await callFn("runGraphqlMutation", { body: { query }, accessToken: "tok", fetch: r.fetch });
    expect(r.seen).toHaveLength(1);
    expect(r.seen[0]!.body.query).toBe(query);
    const none = noFetch();
    await expect(callFn("runGraphqlQuery", { body: { query }, accessToken: "tok", fetch: none.fetch })).rejects.toThrow(/read only/);
    expect(none.seen).toHaveLength(0);
  });

  test("a top-level string after the directive is still rejected by both ops (0 fetches)", async () => {
    for (const query of [
      'query Q($v: I = {a:1}) @d "x" {a}',
      'query Q($v: I = {a:1}) @d """x""" {a}',
      'query Q($v: I = {a:1}) @d {a} "x" mutation M {x}',
      'mutation M($v: I = {a:[1,{b:2}]}) @d "x" {x}',
      'mutation M($v: I = {a:[1,{b:2}]}) @d {x} """d""" query Q {y}',
    ]) {
      expect(() => graphqlOperationKinds(query), query).toThrow(/top-level string or block string/);
      for (const fn of ["runGraphqlQuery", "runGraphqlMutation"] as const) {
        const none = noFetch();
        await expect(callFn(fn, { body: { query }, accessToken: "tok", fetch: none.fetch }), `${fn}: ${query}`).rejects.toThrow(
          /top-level string or block string/,
        );
        expect(none.seen).toHaveLength(0);
      }
    }
  });

  test("hostile documents (incl. linus's earlier cases) are all still rejected with 0 fetches", async () => {
    const queryRejects: Array<[string, RegExp]> = [
      // earlier G13C cases: top-level strings / block strings
      ['query{a} "desc" mutation{x}', /top-level string/],
      ['query{a} """d""" mutation M{x}', /top-level string/],
      ['"lead" mutation { x }', /top-level string/],
      ['query{a} """ block "mutation" """', /top-level string/],
      // earlier G13C cases: mutation / subscription / mixed
      ['mutation { addStar(input: {starrableId: "R_1"}) { clientMutationId } }', /read only/],
      ["subscription { x }", /read only/],
      ['query A { viewer { login } } mutation B { addStar(input: {starrableId: "R_1"}) { clientMutationId } }', /read only/],
      ["fragment F on User { login }\n  mutation\n{ x }", /read only/],
      ["query A { viewer { login } }\n\nsubscription S { y }", /read only/],
      ["type Foo { a: Int }", /non-executable/],
      ["query { a ", /unbalanced/],
      ['query { a(x: "oops) }', /unterminated/],
      // new shapes around default values and directives
      ["query Q($v: I = {a:1}) @d {a} mutation M {x}", /read only/],
      ["query Q($v: I = {a:1}) @d {a} subscription S($w: J = [{b:2}]) @e {y}", /read only/],
      ["query Q($v: I = {a:1}}) mutation {x}", /unbalanced/],
      ["query Q($v: I = {a:1) @d {a}", /unbalanced/],
      ["query Q($v: I = [1}) @d {a}", /unbalanced/],
      ["query Q($v: I = {a:[1}]) @d {a}", /unbalanced/],
      ["query Q($v: I = {a:1}) @d {a]", /unbalanced/],
      ["query Q($v: I = {a:1}) @d {a} ]", /unbalanced/],
      ["query Q($v: I = {a:1} @d {a}", /unbalanced/],
      ["query Q($v: I = {a:1}) @d {a} type T { b: Int }", /non-executable/],
    ];
    for (const [query, re] of queryRejects) {
      expect(() => validateRunGraphqlQueryInput({ body: { query } }), query).toThrow(re);
      const none = noFetch();
      await expect(callFn("runGraphqlQuery", { body: { query }, accessToken: "tok", fetch: none.fetch }), query).rejects.toThrow(re);
      expect(none.seen).toHaveLength(0);
    }
    const mutateRejects = [
      'mutation{a} "desc" query{x}',
      'mutation{a} """d""" query Q{x}',
      'mutation{a} "d" subscription S{x}',
      "query Q { viewer { login } }",
      "mutation M($v: I = {a:1}) @d {x} query Q($w: I = {b:2}) @e {y}",
      "mutation M($v: I = {a:1}) @d {x} subscription S {y}",
      "mutation M($v: I = {a:1}}) query {x}",
      "mutation M($v: I = [{a:1}) @d {x}",
    ];
    for (const query of mutateRejects) {
      expect(() => validateRunGraphqlMutationInput({ body: { query } }), query).toThrow();
      const none = noFetch();
      await expect(callFn("runGraphqlMutation", { body: { query }, accessToken: "tok", fetch: none.fetch }), query).rejects.toThrow();
      expect(none.seen).toHaveLength(0);
    }
  });
});
