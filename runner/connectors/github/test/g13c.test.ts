import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import coverage from "../fixtures/composio-coverage.json";
import * as actions from "../src/actions";
import { defaultConnectorRegistry } from "../../../bun/src/registry";
import {
  G13C_REQUIRED_SCOPES,
  graphqlOperationKinds,
  isTeamNodeId,
  validateCreateSponsorshipInput,
  validateCreateSponsorsTierInput,
  validateRunGraphqlQueryInput,
  validateUpdateSubscriptionInput,
} from "../src/gap_g13c";

// FIX-G13C: the 10 G13 GraphQL ops run through src/graphql.ts gqlRequest.
// graphql.sponsorships.create is fixtures-only: every call here hits a recorder, never GitHub.

const OPS: Record<string, keyof typeof actions> = {
  "graphql.sponsorships.create": "createSponsorshipGraphql",
  "graphql.sponsorships.cancel": "cancelSponsorshipGraphql",
  "graphql.sponsors.tiers.create": "createSponsorsTierGraphql",
  "graphql.sponsors.tiers.publish": "publishSponsorsTierGraphql",
  "graphql.sponsors.tiers.retire": "retireSponsorsTierGraphql",
  "graphql.projects_v2.create": "createProjectV2Graphql",
  "graphql.projects_v2.item_field.clear": "clearProjectV2ItemFieldGraphql",
  "graphql.migrations.abort": "abortRepositoryMigrationGraphql",
  "graphql.subscriptions.update": "updateSubscriptionGraphql",
  "graphql.query": "runGraphqlQuery",
};

type Fixture = {
  operation: string;
  input: Record<string, unknown>;
  request: { method: string; url: string; root: string };
  response: { status: number; body: unknown };
  expected: Record<string, unknown>;
  errorsOn200: { response: { status: number; body: unknown }; expectedError: { code: string; message: string } };
};
type Seen = { url: string; method: string; headers: Record<string, string>; body: Record<string, any> };

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
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const fixture = async (op: string) => (await import(`../fixtures/cases/${op.replaceAll(".", "_")}.json`)).default as Fixture;
const call = (op: string, input: Record<string, unknown>) =>
  Promise.resolve((actions[OPS[op]!] as (i: unknown) => Record<string, unknown> | Promise<Record<string, unknown>>)(input));
const opsOf = manifest.operations as Record<string, Record<string, any>>;

describe("github FIX-G13C: G13 GraphQL ops via gqlRequest", () => {
  test("version 0.86.11 at 848 ops; auth.scopes unchanged", () => {
    expect(manifest.version).toBe("0.86.11");
    expect(Object.keys(opsOf)).toHaveLength(848);
    expect(manifest.auth.scopes).toEqual(["repo", "read:org", "admin:repo_hook", "admin:org_hook", "gist", "notifications", "admin:org"]);
    for (const scope of ["user", "project", "workflow"]) expect(manifest.auth.scopes).not.toContain(scope);
  });

  test("manifest: no request blocks, closed inputs, no effect keys (FIX-EFFECTS), per-op scopes", () => {
    for (const op of Object.keys(OPS)) {
      const spec = opsOf[op]!;
      expect(spec.request, op).toBeUndefined();
      expect(spec.inputSchema.additionalProperties, op).toBe(false);
      expect(spec.sideEffect, op).toBe(op === "graphql.query" ? "read" : "write");
      // FIX-EFFECTS (v0.81.2): graphql.node.get returns {found, node}, not {subscribable}, so
      // subscriptions.update no longer keeps Reconcile; no G13 op carries effect keys.
      expect(spec.effectPolicy, op).toBeUndefined();
      expect(spec.reconcile, op).toBeUndefined();
      expect(spec.reconcileInput, op).toBeUndefined();
      const scopes = G13C_REQUIRED_SCOPES[op]!;
      if (scopes.length === 0) expect(spec.requiredScopes, op).toBeUndefined();
      else expect(spec.requiredScopes, op).toEqual([...scopes]);
      for (const scope of scopes) expect(String(spec.description), op).toContain(scope);
      if (scopes.length > 0) expect(String(spec.description), op).toContain("CONNECTOR_CAPABILITY_MISSING");
    }
    expect(G13C_REQUIRED_SCOPES["graphql.migrations.abort"]).toEqual(["repo", "admin:org", "workflow"]);
    expect(G13C_REQUIRED_SCOPES["graphql.projects_v2.create"]).toEqual(["project"]);
  });

  test("descriptions: money warning, USD dollars, classic-PAT caveat, Team removal, read-only query", () => {
    const d = (op: string) => String(opsOf[op]!.description);
    expect(d("graphql.sponsorships.create")).toContain("Charges the connected account.");
    expect(d("graphql.sponsorships.create")).toContain("Never retried");
    expect(d("graphql.sponsors.tiers.create")).toContain("whole US dollars (not cents)");
    expect(d("graphql.migrations.abort")).toContain("Classic-PAT caveat");
    expect(d("graphql.migrations.abort")).toContain("fine-grained PATs are not supported");
    expect(d("graphql.subscriptions.update")).toContain("2026-07-01");
    expect(d("graphql.query")).toContain("mutation and subscription operations are rejected");
    expect(opsOf["graphql.sponsorships.create"]!.inputSchema.properties.amount).toMatchObject({ type: "integer", minimum: 1, maximum: 12000 });
  });

  test("graphql.query maps Composio RUN_GRAPH_QL_QUERY and (FIX-G14C, linus) RUN_GRAPH_QL_RELAY_QUERY", () => {
    const mapped = coverage.mapped as Record<string, string>;
    expect(Object.entries(mapped).filter(([, v]) => v === "graphql.query").map(([k]) => k).sort()).toEqual([
      "GITHUB_RUN_GRAPH_QL_QUERY",
      "GITHUB_RUN_GRAPH_QL_RELAY_QUERY",
    ]);
    expect((coverage.missing_still as Array<{ slug: string }>).map((m) => m.slug)).not.toContain("GITHUB_RUN_GRAPH_QL_RELAY_QUERY");
  });

  for (const op of Object.keys(OPS)) {
    test(`${op}: fixture success (POST /graphql, Next-Global-ID) and errors-on-200, one request each`, async () => {
      const fx = await fixture(op);
      expect(fx.operation).toBe(op);
      const ok = recorder([json(fx.response.body, fx.response.status)]);
      const result = await call(op, { ...fx.input, accessToken: "tok", fetch: ok.fetch });
      expect(ok.seen).toHaveLength(1);
      expect(ok.seen[0]!.method).toBe("POST");
      expect(ok.seen[0]!.url).toBe(fx.request.url);
      expect(ok.seen[0]!.headers["x-github-next-global-id"]).toBe("1");
      expect(ok.seen[0]!.body.query).toContain(op === "graphql.query" ? "viewer" : `${fx.request.root}(input: $input)`);
      expect(ok.seen[0]!.body.query).not.toContain("clientMutationId");
      expect(result).toMatchObject({ connector: "github", action: op, source: "connector", ...fx.expected });
      const bad = recorder([json(fx.errorsOn200.response.body, fx.errorsOn200.response.status)]);
      await expect(call(op, { ...fx.input, accessToken: "tok", fetch: bad.fetch })).rejects.toMatchObject(fx.errorsOn200.expectedError);
      expect(bad.seen).toHaveLength(1);
    });
  }

  test("missing per-op scope → CONNECTOR_CAPABILITY_MISSING (GraphQL type and header diff); unscoped ops stay UPSTREAM", async () => {
    for (const op of Object.keys(OPS)) {
      const scopes = [...G13C_REQUIRED_SCOPES[op]!];
      const fx = await fixture(op);
      const errors = [{ type: "INSUFFICIENT_SCOPES", message: "Your token has not been granted the required scopes." }];
      const r = recorder([json({ data: null, errors })]);
      const err = await call(op, { ...fx.input, accessToken: "tok", fetch: r.fetch }).catch((e) => e);
      if (scopes.length === 0) {
        expect(err.code, op).toBe("CONNECTOR_UPSTREAM_ERROR");
        continue;
      }
      expect(err, op).toBeInstanceOf(Error);
      expect(err, op).toMatchObject({
        ok: false,
        code: "CONNECTOR_CAPABILITY_MISSING",
        reason: "permission_missing",
        missingScopes: scopes,
        requiredScopes: scopes,
        reconsentRequired: true,
        providerCode: "INSUFFICIENT_SCOPES",
      });
      expect(r.seen, op).toHaveLength(1);
    }
    const fx = await fixture("graphql.migrations.abort");
    const h = recorder([json({ message: "Forbidden" }, 403, { "x-accepted-oauth-scopes": "repo, admin:org, workflow", "x-oauth-scopes": "repo, admin:org" })]);
    await expect(call("graphql.migrations.abort", { ...fx.input, accessToken: "tok", fetch: h.fetch })).rejects.toMatchObject({
      code: "CONNECTOR_CAPABILITY_MISSING",
      status: 403,
      missingScopes: ["workflow"],
      requiredScopes: ["repo", "admin:org", "workflow"],
      reconsentRequired: true,
    });
  });

  test("sponsorships.create guardrails: amount XOR tierId, 1–12000 USD, isRecurring rules; never inferred; never retried", async () => {
    expect(() => validateCreateSponsorshipInput({ sponsorableLogin: "mona" })).toThrow(/exactly one of amount or tierId/);
    expect(() => validateCreateSponsorshipInput({ sponsorableLogin: "mona", amount: 5, tierId: "ST_1", isRecurring: true })).toThrow(/exactly one/);
    expect(() => validateCreateSponsorshipInput({ sponsorableLogin: "mona", amount: 5 })).toThrow(/isRecurring is required/);
    expect(() => validateCreateSponsorshipInput({ sponsorableLogin: "mona", tierId: "ST_1", isRecurring: true })).toThrow(/omit it when tierId/);
    for (const amount of [0, 12001, 5.5, "5", 500 * 100 * 100]) {
      expect(() => validateCreateSponsorshipInput({ sponsorableLogin: "mona", amount, isRecurring: false })).toThrow(/amount must be an integer between 1 and 12000/);
    }
    expect(validateCreateSponsorshipInput({ sponsorableLogin: "mona", amount: 12000, isRecurring: false })).toEqual({ sponsorableLogin: "mona", amount: 12000, isRecurring: false });
    expect(validateCreateSponsorshipInput({ sponsorableLogin: "mona", tierId: "ST_1" })).toEqual({ sponsorableLogin: "mona", tierId: "ST_1" });

    // tierId path sends no amount and no isRecurring.
    const fx = await fixture("graphql.sponsorships.create");
    const t = recorder([json(fx.response.body)]);
    await call("graphql.sponsorships.create", { sponsorableLogin: "mona", tierId: "ST_1", accessToken: "tok", fetch: t.fetch });
    expect(t.seen[0]!.body.variables).toEqual({ input: { sponsorableLogin: "mona", tierId: "ST_1" } });
    // invalid input never reaches the network.
    const none = recorder(() => {
      throw new Error("must not fetch");
    });
    await expect(call("graphql.sponsorships.create", { sponsorableLogin: "mona", amount: 50, accessToken: "tok", fetch: none.fetch })).rejects.toThrow(/isRecurring/);
    expect(none.seen).toHaveLength(0);
    // rate limit, 502 and timeouts are surfaced once, never retried.
    for (const response of [
      () => json({ data: null, errors: [{ type: "RATE_LIMITED", message: "slow down" }] }, 200, { "retry-after": "60" }),
      () => json({ message: "Bad gateway" }, 502),
    ]) {
      const r = recorder(response);
      await expect(call("graphql.sponsorships.create", { ...fx.input, accessToken: "tok", fetch: r.fetch })).rejects.toBeDefined();
      expect(r.seen).toHaveLength(1);
    }
    let thrown = 0;
    const boom = async () => {
      thrown += 1;
      throw new TypeError("network down");
    };
    await expect(call("graphql.sponsorships.create", { ...fx.input, accessToken: "tok", fetch: boom })).rejects.toBeDefined();
    expect(thrown).toBe(1);
  });

  test("tiers.create amount is whole USD (1–12000) and returns the tier id", async () => {
    expect(() => validateCreateSponsorsTierInput({ amount: 500, description: "x" })).not.toThrow();
    expect(() => validateCreateSponsorsTierInput({ amount: 0, description: "x" })).toThrow(/amount/);
    expect(() => validateCreateSponsorsTierInput({ amount: 5, description: "x", repositoryName: "r" })).toThrow(/go together/);
    const fx = await fixture("graphql.sponsors.tiers.create");
    const r = recorder([json(fx.response.body)]);
    const out = await call("graphql.sponsors.tiers.create", { ...fx.input, accessToken: "tok", fetch: r.fetch });
    expect(r.seen[0]!.body.variables).toEqual({ input: { amount: 5, description: "Thanks!" } });
    expect(out.tierId).toBe("ST_kwDOA");
  });

  test("subscriptions.update rejects Team ids (new and legacy) before any request", async () => {
    expect(isTeamNodeId("T_kwDOAAAA")).toBe(true);
    expect(isTeamNodeId(btoa("04:Team12345"))).toBe(true);
    expect(isTeamNodeId("R_kgDOA")).toBe(false);
    expect(isTeamNodeId(btoa("010:Repository1"))).toBe(false);
    expect(() => validateUpdateSubscriptionInput({ subscribableId: "T_kwDOAAAA", state: "SUBSCRIBED" })).toThrow(/2026-07-01/);
    expect(() => validateUpdateSubscriptionInput({ subscribableId: "R_1", state: "WATCHING" })).toThrow(/state must be one of/);
    const none = recorder(() => {
      throw new Error("must not fetch");
    });
    await expect(
      call("graphql.subscriptions.update", { subscribableId: btoa("04:Team1"), state: "IGNORED", accessToken: "tok", fetch: none.fetch }),
    ).rejects.toThrow(/Team/);
    expect(none.seen).toHaveLength(0);
  });

  test("graphql.query rejects any top-level string or block string (descriptions hid the next keyword) with zero fetches", async () => {
    const smuggled: Array<{ query: string; operationName?: string }> = [
      { query: 'query{a} "desc" mutation{x}' },
      { query: 'query{a} """d""" mutation M{x}', operationName: "M" },
      { query: '"lead" mutation { x }' },
      { query: 'query{a} """ block "mutation" """' },
    ];
    for (const body of smuggled) {
      expect(() => validateRunGraphqlQueryInput({ body }), body.query).toThrow(/top-level string or block string/);
      expect(() => graphqlOperationKinds(body.query), body.query).toThrow(/top-level string or block string/);
      const none = recorder(() => {
        throw new Error("must not fetch");
      });
      await expect(call("graphql.query", { body, accessToken: "tok", fetch: none.fetch })).rejects.toThrow(/top-level string or block string/);
      expect(none.seen).toHaveLength(0);
    }
    // Strings inside arguments, default values and selections stay allowed.
    expect(graphqlOperationKinds('query Q($q: String = """x""") @d(a: "b") { s(q: "mutation{x}") { n } }')).toEqual(["query"]);
  });

  test("graphql.query parses the document and rejects mutation/subscription before any request", async () => {
    const ok = [
      "{ viewer { login } }",
      "query A { viewer { login } } query B { rateLimit { remaining } }",
      "fragment F on User { login } query { viewer { ...F } }",
      'query($q: String = "mutation { x }") { search(query: $q, type: REPOSITORY, first: 1) { repositoryCount } }',
      "# mutation { deleteRepository }\nquery { viewer { login } }",
    ];
    expect(graphqlOperationKinds(ok[0]!)).toEqual(["query"]);
    expect(graphqlOperationKinds(ok[1]!)).toEqual(["query", "query"]);
    expect(graphqlOperationKinds(ok[2]!)).toEqual(["query"]);
    expect(graphqlOperationKinds(ok[3]!)).toEqual(["query"]);
    expect(graphqlOperationKinds(ok[4]!)).toEqual(["query"]);
    const bad = [
      "mutation { addStar(input: {starrableId: \"R_1\"}) { clientMutationId } }",
      "subscription { x }",
      "query A { viewer { login } } mutation B { addStar(input: {starrableId: \"R_1\"}) { clientMutationId } }",
      "fragment F on User { login }\n  mutation\n{ x }",
      "query A { viewer { login } }\n\nsubscription S { y }",
    ];
    for (const query of bad) {
      expect(() => validateRunGraphqlQueryInput({ body: { query } }), query).toThrow(/read only/);
      const none = recorder(() => {
        throw new Error("must not fetch");
      });
      await expect(call("graphql.query", { body: { query }, accessToken: "tok", fetch: none.fetch })).rejects.toThrow(/read only/);
      expect(none.seen).toHaveLength(0);
    }
    expect(() => validateRunGraphqlQueryInput({ body: { query: "type Foo { a: Int }" } })).toThrow(/non-executable/);
    expect(() => validateRunGraphqlQueryInput({ body: { query: "query { a " } })).toThrow(/unbalanced/);
    expect(() => validateRunGraphqlQueryInput({ body: { query: 'query { a(x: "oops) }' } })).toThrow(/unterminated/);
    expect(() => validateRunGraphqlQueryInput({ body: { query: "fragment F on User { login }" } })).toThrow(/query operation/);
    expect(() => validateRunGraphqlQueryInput({ body: { query: "{ a }", extensions: {} } })).toThrow(/not allowed/);

    const r = recorder([json({ data: { viewer: { login: "octocat" } } })]);
    await call("graphql.query", { body: { query: ok[1], variables: { a: 1 }, operationName: "B" }, accessToken: "tok", fetch: r.fetch });
    expect(r.seen[0]!.body).toEqual({ query: ok[1], variables: { a: 1 }, operationName: "B" });
    const plain = recorder([json({ data: {} })]);
    await call("graphql.query", { body: { query: ok[0] }, accessToken: "tok", fetch: plain.fetch });
    expect(plain.seen[0]!.body).toEqual({ query: ok[0], variables: {} });
  });
});

describe("FIX-G13C Reconcile through the registry", () => {
  test("FIX-EFFECTS: subscriptions.update is one call, primary returned", async () => {
    const r = recorder([
      json({ data: { updateSubscription: { subscribable: { __typename: "Repository", id: "R_kgDOA", viewerSubscription: "IGNORED" } } } }),
    ]);
    const result = defaultConnectorRegistry.executeAction("github", "graphql.subscriptions.update", {
      subscribableId: "R_kgDOA",
      state: "IGNORED",
      accessToken: "tok",
      fetch: r.fetch,
    });
    if (!result.ok) throw new Error(JSON.stringify(result));
    const output = (await Promise.resolve(result.output)) as Record<string, any>;
    expect(r.seen).toHaveLength(1);
    expect(r.seen[0]!.body.query).toContain("updateSubscription(");
    expect(output.action).toBe("graphql.subscriptions.update");
  });

  test("create/delete-like G13 writes have no effect: one call, primary returned", async () => {
    const fx = await fixture("graphql.projects_v2.create");
    const r = recorder([json(fx.response.body)]);
    const result = defaultConnectorRegistry.executeAction("github", "graphql.projects_v2.create", { ...fx.input, accessToken: "tok", fetch: r.fetch });
    if (!result.ok) throw new Error(JSON.stringify(result));
    expect(await Promise.resolve(result.output)).toMatchObject({ action: "graphql.projects_v2.create", projectV2: { number: 7 } });
    expect(r.seen).toHaveLength(1);
  });

  test("graphql.query closed body rejects unknown keys at dispatch", () => {
    const result = defaultConnectorRegistry.executeAction("github", "graphql.query", { body: { query: "{ a }", foo: 1 }, accessToken: "t" });
    expect(result.ok).toBe(false);
  });
});
