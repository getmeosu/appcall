import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import {
  getGraphqlCodeOfConduct,
  getGraphqlLicense,
  getGraphqlNode,
  getGraphqlNodes,
  getGraphqlOrganization,
  getGraphqlRateLimit,
  getGraphqlRepository,
  getGraphqlRepositoryOwner,
  getGraphqlResource,
  getGraphqlTopic,
  getGraphqlViewer,
  getMetaRoot,
  listGraphqlCodesOfConduct,
  listGraphqlLicenses,
  listGraphqlSecurityAdvisories,
  listGraphqlSecurityVulnerabilities,
} from "../src/actions";
import {
  validateGetGraphqlNodeInput,
  validateGetGraphqlNodesInput,
  validateGetGraphqlTopicInput,
  validateListGraphqlSecurityAdvisoriesInput,
} from "../src/gap_g11";

const PATHS: Record<string, { root: string }> = {
  "graphql.node.get": { root: "node(id:)" },
  "graphql.nodes.get": { root: "nodes(ids:)" },
  "graphql.rate_limit.get": { root: "rateLimit" },
  "graphql.viewer.get": { root: "viewer" },
  "graphql.repository.get": { root: "repository(owner:" },
  "graphql.organization.get": { root: "organization(login:)" },
  "graphql.repository_owner.get": { root: "repositoryOwner(login:)" },
  "graphql.topic.get": { root: "topic(name:)" },
  "graphql.resource.get": { root: "resource(url:)" },
  "graphql.codes_of_conduct.get": { root: "codeOfConduct(key:)" },
  "graphql.codes_of_conduct.list": { root: "codesOfConduct" },
  "graphql.licenses.get": { root: "license(key:)" },
  "graphql.licenses.list": { root: "licenses" },
  "graphql.security_advisories.list": { root: "securityAdvisories" },
  "graphql.security_vulnerabilities.list": { root: "securityVulnerabilities" },
};

type Seen = { url: string; method: string; body?: string; headers?: HeadersInit };

function recorder(responses: Response[] | (() => Response)) {
  const seen: Seen[] = [];
  let i = 0;
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    seen.push({
      url: String(input),
      method: init?.method ?? "GET",
      body: init?.body as string | undefined,
      headers: init?.headers,
    });
    if (typeof responses === "function") return responses();
    return responses[i++];
  };
  return { seen, fetch };
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function gqlBody(data: unknown, errors?: unknown[]) {
  return errors ? { data, errors } : { data };
}

describe("github gap G11 GraphQL reads + enrichment", () => {
  test("version is 0.78.1 at 812 ops with the read/write breakdown", () => {
    expect(manifest.version).toBe("0.78.1");
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    expect(Object.keys(ops)).toHaveLength(812);
    const kinds = { action: 0, sync: 0, webhook: 0 };
    const side = { read: 0, write: 0, absent: 0 };
    for (const op of Object.values(ops)) {
      kinds[op.kind as keyof typeof kinds] += 1;
      if (op.kind === "action") {
        if (op.sideEffect === "read") side.read += 1;
        else if (op.sideEffect === "write") side.write += 1;
        else side.absent += 1;
      }
    }
    expect(kinds).toEqual({ action: 762, sync: 4, webhook: 46 });
    expect(side).toEqual({ read: 411, write: 336, absent: 15 });
  });

  test("the fifteen G11 ops are read-only, omit effects, and document GraphQL roots", () => {
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    expect(Object.keys(PATHS)).toHaveLength(15);
    for (const [key, meta] of Object.entries(PATHS)) {
      const op = ops[key];
      expect(op).toBeDefined();
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("read");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(op.effect).toBeUndefined();
      expect(String(op.description)).toContain(meta.root.split("(")[0]);
    }
  });

  test("enrichment fields are documented on node.get and viewer.get", () => {
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    expect(String(ops["graphql.node.get"].description)).toContain("viewerIsFollowing");
    expect(String(ops["graphql.node.get"].description)).toContain("viewerSubscription");
    expect(String(ops["graphql.viewer.get"].description)).toContain("indicatesLimitedAvailability");
    expect(String(ops["graphql.viewer.get"].description)).toContain("organization { id }");
  });

  test("validators enforce id lists, topic related count, and advisory paging", () => {
    expect(validateGetGraphqlNodeInput({ id: "U_kgDO" })).toEqual({ id: "U_kgDO" });
    expect(validateGetGraphqlNodesInput({ ids: ["a", "b"] })).toEqual({ ids: ["a", "b"] });
    expect(() => validateGetGraphqlNodesInput({ ids: [] })).toThrow(/1–100/);
    expect(validateGetGraphqlTopicInput({ name: "rust", includeRelatedTopics: true, relatedTopicsCount: 5 }))
      .toEqual({ name: "rust", includeRelatedTopics: true, relatedTopicsCount: 5 });
    expect(() => validateGetGraphqlTopicInput({ name: "rust", relatedTopicsCount: 99 })).toThrow(/relatedTopicsCount/);
    expect(validateListGraphqlSecurityAdvisoriesInput({ first: 10, after: "c" }))
      .toEqual({ first: 10, after: "c" });
    expect(() => validateListGraphqlSecurityAdvisoriesInput({ first: 10, last: 5 })).toThrow(/first and last/);
  });

  test("dry-run wrappers return validated payloads", () => {
    expect(getGraphqlNode({ id: "U_1" })).toMatchObject({ action: "graphql.node.get", validated: { id: "U_1" } });
    expect(getGraphqlViewer({})).toMatchObject({ action: "graphql.viewer.get" });
    expect(listGraphqlLicenses({})).toMatchObject({ action: "graphql.licenses.list" });
  });

  test("live calls POST /graphql with Next-Global-ID; node enrichment + NOT_FOUND → found:false", async () => {
    const node = recorder([json(gqlBody({
      node: {
        __typename: "User",
        id: "U_1",
        login: "octocat",
        name: "Octo",
        url: "https://github.com/octocat",
        databaseId: 1,
        viewerIsFollowing: true,
      },
    }))]);
    expect(await getGraphqlNode({ accessToken: "t", fetch: node.fetch, id: "U_1" }))
      .toMatchObject({ found: true, node: { __typename: "User", viewerIsFollowing: true } });
    expect(node.seen[0].method).toBe("POST");
    expect(node.seen[0].url).toContain("/graphql");
    const headers = new Headers(node.seen[0].headers);
    expect(headers.get("X-Github-Next-Global-ID")).toBe("1");
    const body = JSON.parse(node.seen[0].body!);
    expect(body.query).toContain("viewerIsFollowing");
    expect(body.query).toContain("... on Subscribable");
    expect(body.query).toContain("viewerSubscription");

    const missing = recorder([json(gqlBody(null, [{ type: "NOT_FOUND", message: "Could not resolve" }]))]);
    expect(await getGraphqlNode({ accessToken: "t", fetch: missing.fetch, id: "missing" }))
      .toMatchObject({ found: false, node: null });
  });

  test("REST fetchJSON does not send X-Github-Next-Global-ID", async () => {
    const rest = recorder([json({ current_user_url: "https://api.github.com/user" })]);
    expect(await getMetaRoot({ accessToken: "t", fetch: rest.fetch }))
      .toMatchObject({ root: { current_user_url: "https://api.github.com/user" } });
    expect(rest.seen).toHaveLength(1);
    expect(rest.seen[0].method).toBe("GET");
    expect(rest.seen[0].url).toBe("https://api.github.com/");
    expect(rest.seen[0].url).not.toContain("/graphql");
    const headers = new Headers(rest.seen[0].headers);
    expect(headers.get("X-Github-Next-Global-ID")).toBeNull();
    expect(headers.get("Authorization")).toBe("Bearer t");
    expect(headers.get("X-GitHub-Api-Version")).toBe("2022-11-28");
  });

  test("viewer.get selects status including organization id", async () => {
    const viewer = recorder([json(gqlBody({
      viewer: {
        id: "U_1",
        login: "me",
        name: "Me",
        url: "https://github.com/me",
        databaseId: 2,
        status: {
          emoji: ":wave:",
          message: "hi",
          expiresAt: null,
          indicatesLimitedAvailability: false,
          organization: { id: "O_1" },
        },
      },
    }))]);
    expect(await getGraphqlViewer({ accessToken: "t", fetch: viewer.fetch }))
      .toMatchObject({
        viewer: {
          status: {
            emoji: ":wave:",
            indicatesLimitedAvailability: false,
            organization: { id: "O_1" },
          },
        },
      });
    expect(JSON.parse(viewer.seen[0].body!).query).toContain("indicatesLimitedAvailability");
    expect(JSON.parse(viewer.seen[0].body!).query).toContain("organization { id }");
  });

  test("lookups, lists, rate limit, and RATE_LIMITED / INSUFFICIENT_SCOPES mapping", async () => {
    expect(await getGraphqlRepository({
      accessToken: "t",
      fetch: recorder([json(gqlBody({ repository: { id: "R_1", name: "r", nameWithOwner: "o/r", url: "u", description: null, isPrivate: false, isFork: false, createdAt: "a", updatedAt: "b", primaryLanguage: null, viewerSubscription: "SUBSCRIBED" } }))]).fetch,
      owner: "o",
      repo: "r",
    })).toMatchObject({ found: true, repository: { name: "r", viewerSubscription: "SUBSCRIBED" } });

    expect(await getGraphqlOrganization({
      accessToken: "t",
      fetch: recorder([json(gqlBody({ organization: { id: "O_1", login: "octo", name: "Octo", url: "u", description: null, databaseId: 3, viewerIsFollowing: false } }))]).fetch,
      login: "octo",
    })).toMatchObject({ found: true, organization: { viewerIsFollowing: false } });

    expect(await getGraphqlRepositoryOwner({
      accessToken: "t",
      fetch: recorder([json(gqlBody({ repositoryOwner: { __typename: "User", id: "U_1", login: "u", name: "U", url: "u", databaseId: 1, viewerIsFollowing: true } }))]).fetch,
      login: "u",
    })).toMatchObject({ found: true, repositoryOwner: { __typename: "User" } });

    expect(await getGraphqlTopic({
      accessToken: "t",
      fetch: recorder([json(gqlBody({ topic: { id: "T_1", name: "rust", relatedTopics: [{ id: "T_2", name: "cargo" }] } }))]).fetch,
      name: "rust",
      includeRelatedTopics: true,
      relatedTopicsCount: 2,
    })).toMatchObject({ found: true, topic: { name: "rust" } });

    expect(await getGraphqlResource({
      accessToken: "t",
      fetch: recorder([json(gqlBody({ resource: { __typename: "Repository", id: "R_1", name: "r", nameWithOwner: "o/r", url: "u" } }))]).fetch,
      url: "https://github.com/o/r",
    })).toMatchObject({ found: true, resource: { __typename: "Repository" } });

    expect(await getGraphqlCodeOfConduct({
      accessToken: "t",
      fetch: recorder([json(gqlBody({ codeOfConduct: { key: "contributor_covenant", name: "CC", url: "u", body: "b" } }))]).fetch,
      key: "contributor_covenant",
    })).toMatchObject({ found: true, codeOfConduct: { key: "contributor_covenant" } });

    expect(await listGraphqlCodesOfConduct({
      accessToken: "t",
      fetch: recorder([json(gqlBody({ codesOfConduct: [{ key: "a", name: "A", url: null, body: null }] }))]).fetch,
    })).toMatchObject({ codesOfConduct: [{ key: "a" }] });

    expect(await getGraphqlLicense({
      accessToken: "t",
      fetch: recorder([json(gqlBody({ license: { key: "mit", spdxId: "MIT", name: "MIT", nickname: null, url: "u", body: "b" } }))]).fetch,
      key: "mit",
    })).toMatchObject({ found: true, license: { key: "mit" } });

    expect(await listGraphqlLicenses({
      accessToken: "t",
      fetch: recorder([json(gqlBody({ licenses: [{ key: "mit", spdxId: "MIT", name: "MIT", nickname: null, url: null, body: null }] }))]).fetch,
    })).toMatchObject({ licenses: [{ key: "mit" }] });

    expect(await getGraphqlRateLimit({
      accessToken: "t",
      fetch: recorder([json(gqlBody({ rateLimit: { limit: 5000, remaining: 4999, used: 1, resetAt: "t", cost: 1 } }))]).fetch,
      dryRun: true,
    })).toMatchObject({ rateLimit: { remaining: 4999 } });

    expect(await getGraphqlNodes({
      accessToken: "t",
      fetch: recorder([json(gqlBody({ nodes: [{ __typename: "User", id: "U_1", login: "a", name: null, url: "u", databaseId: 1, viewerIsFollowing: false }, null] }))]).fetch,
      ids: ["U_1", "missing"],
    })).toMatchObject({ nodes: [{ id: "U_1" }, null] });

    expect(await listGraphqlSecurityAdvisories({
      accessToken: "t",
      fetch: recorder([json(gqlBody({
        securityAdvisories: {
          totalCount: 1,
          nodes: [{ id: "A_1", ghsaId: "GHSA-1", summary: "s", description: "d", severity: "HIGH", publishedAt: "a", updatedAt: "b", permalink: "p", identifiers: [] }],
          pageInfo: { hasNextPage: false, endCursor: null, hasPreviousPage: false, startCursor: null },
        },
      }))]).fetch,
      first: 5,
    })).toMatchObject({ advisories: [{ ghsaId: "GHSA-1" }], totalCount: 1 });

    expect(await listGraphqlSecurityVulnerabilities({
      accessToken: "t",
      fetch: recorder([json(gqlBody({
        securityVulnerabilities: {
          totalCount: 1,
          nodes: [{
            severity: "HIGH",
            updatedAt: "a",
            vulnerableVersionRange: "<1",
            firstPatchedVersion: { identifier: "1.0.0" },
            package: { name: "left-pad", ecosystem: "NPM" },
            advisory: { ghsaId: "GHSA-x", summary: "s", severity: "HIGH", permalink: "p" },
          }],
          pageInfo: { hasNextPage: false, endCursor: null, hasPreviousPage: false, startCursor: null },
        },
      }))]).fetch,
      package: "left-pad",
    })).toMatchObject({ vulnerabilities: [{ package: { name: "left-pad" } }] });

    const limited = recorder([json(
      gqlBody(null, [{ type: "RATE_LIMITED", message: "API rate limit exceeded" }]),
      200,
      { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 30) },
    )]);
    await expect(getGraphqlViewer({ accessToken: "t", fetch: limited.fetch }))
      .rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });

    const scopes = recorder([json(gqlBody(null, [{ type: "INSUFFICIENT_SCOPES", message: "Requires one of: user" }]))]);
    try {
      await getGraphqlViewer({ accessToken: "t", fetch: scopes.fetch });
      throw new Error("expected insufficient scopes to reject");
    } catch (error) {
      expect(error).toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
      expect(String((error as { message?: string }).message)).toContain("user");
    }
  });
});
