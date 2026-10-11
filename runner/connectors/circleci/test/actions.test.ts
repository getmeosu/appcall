import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import user from "../fixtures/user.json";
import project from "../fixtures/project.json";
import pipelines from "../fixtures/pipelines.json";
import pipeline from "../fixtures/pipeline.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers });

describe("CircleCI declarative Composio contract", () => {
  test("healthcheck sends Circle-Token and maps user", async () => {
    const seen: Request[] = [];
    const result = await actions.healthcheck!({ apiKey: "secret", fetch: async (input, init) => { seen.push(new Request(input, init)); return response(user); } });
    expect(seen[0].url).toBe("https://circleci.com/api/v2/me");
    expect(seen[0].headers.get("circle-token")).toBe("secret");
    expect(result).toMatchObject({ user, connector: "circleci", action: "healthcheck", source: "provider" });
  });

  test("lists pipelines with encoded project slug and preserves next token", async () => {
    const seen: Request[] = [];
    const result = await actions["pipelines.list"]!({ apiKey: "secret", projectSlug: "gh/acme/repo", branch: "main", pageToken: "p 1", fetch: async (input, init) => { seen.push(new Request(input, init)); return response(pipelines); } });
    const url = new URL(seen[0].url);
    expect(url.pathname).toBe("/api/v2/project/gh%2Facme%2Frepo/pipeline");
    expect(url.searchParams.get("page-token")).toBe("p 1");
    expect(result).toMatchObject({ items: pipelines.items, nextPageToken: "next-1" });
    expect(seen).toHaveLength(1);
  });

  test("escapes IDs and rejects missing values", async () => {
    const seen: Request[] = [];
    await actions["pipelines.get"]!({ apiKey: "secret", pipelineId: "pl/a?b", fetch: async (input, init) => { seen.push(new Request(input, init)); return response(pipeline); } });
    expect(new URL(seen[0].url).pathname).toBe("/api/v2/pipeline/pl%2Fa%3Fb");
    await expect(actions["pipelines.get"]!({ apiKey: "secret", pipelineId: "", fetch: async () => response(pipeline) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
  });

  test("maps failures and Retry-After without exposing credentials", async () => {
    for (const status of [401, 403, 404, 500, 502]) await expect(actions["projects.get"]!({ apiKey: "secret", projectSlug: "gh/acme/repo", fetch: async () => response({ message: "provider detail", apiKey: "secret" }, status) })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions.healthcheck!({ apiKey: "secret", fetch: async () => response({ message: "slow" }, 429, { "Retry-After": "7" }) })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 7 });
  });

  test("compiles every declared action with a request block", () => {
    const compiled = Object.keys(actions).sort();
    const declared = Object.entries(manifest.operations)
      .filter(([, op]) => (op as { kind: string }).kind === "action" && (op as { request?: unknown }).request)
      .map(([key]) => key)
      .sort();
    expect(compiled).toEqual(declared);
    expect(compiled.length).toBe(66);
  });

  test("creates a context with owner object body", async () => {
    const seen: Request[] = [];
    const owner = { id: "org-1", type: "organization" };
    await actions["contexts.create"]!({ apiKey: "secret", name: "deploy", owner, fetch: async (input, init) => { seen.push(new Request(input, init)); return response({ id: "ctx-1", name: "deploy" }); } });
    expect(seen[0].url).toBe("https://circleci.com/api/v2/context");
    expect(seen[0].method).toBe("POST");
    expect(await seen[0].json()).toEqual({ name: "deploy", owner });
  });

  test("triggers a pipeline with encoded slug and optional parameters", async () => {
    const seen: Request[] = [];
    await actions["pipelines.trigger"]!({ apiKey: "secret", projectSlug: "gh/acme/repo", branch: "main", parameters: { deploy: true }, fetch: async (input, init) => { seen.push(new Request(input, init)); return response({ id: "pl-2", state: "created" }, 201); } });
    expect(new URL(seen[0].url).pathname).toBe("/api/v2/project/gh%2Facme%2Frepo/pipeline");
    expect(seen[0].method).toBe("POST");
    expect(await seen[0].json()).toEqual({ branch: "main", parameters: { deploy: true } });
  });

  test("lists job artifacts and job details on documented v2 paths", async () => {
    const seen: Request[] = [];
    await actions["jobs.artifacts.list"]!({ apiKey: "secret", projectSlug: "gh/acme/repo", jobNumber: 9, pageToken: "n1", fetch: async (input, init) => { seen.push(new Request(input, init)); return response({ items: [] }); } });
    expect(new URL(seen[0].url).pathname).toBe("/api/v2/project/gh%2Facme%2Frepo/9/artifacts");
    expect(new URL(seen[0].url).searchParams.get("page-token")).toBe("n1");
    await actions["jobs.get"]!({ apiKey: "secret", projectSlug: "gh/acme/repo", jobNumber: 9, fetch: async (input, init) => { seen.push(new Request(input, init)); return response({ number: 9, status: "success" }); } });
    expect(new URL(seen[1].url).pathname).toBe("/api/v2/project/gh%2Facme%2Frepo/job/9");
  });

  test("posts GraphQL orb and context mutations to graphql-unstable", async () => {
    const seen: Request[] = [];
    await actions["orbs.get"]!({ apiKey: "secret", name: "circleci/node", fetch: async (input, init) => { seen.push(new Request(input, init)); return response({ data: { orb: { name: "circleci/node" } } }); } });
    expect(seen[0].url).toBe("https://circleci.com/graphql-unstable");
    const orbBody = await seen[0].json();
    expect(orbBody.query).toContain("orb(name: $name)");
    expect(orbBody.variables).toEqual({ name: "circleci/node" });
    await actions["contexts.create_graphql"]!({ apiKey: "secret", ownerId: "org-1", ownerType: "ORGANIZATION", contextName: "deploy", fetch: async (input, init) => { seen.push(new Request(input, init)); return response({ data: { createContext: { context: { id: "c1" } } } }); } });
    const ctxBody = await seen[1].json();
    expect(ctxBody.query).toContain("createContext");
    expect(ctxBody.variables).toEqual({ ownerId: "org-1", ownerType: "ORGANIZATION", contextName: "deploy" });
  });

  test("treats GraphQL errors array as an upstream failure", async () => {
    await expect(actions["orbs.get"]!({ apiKey: "secret", name: "missing/orb", fetch: async () => response({ errors: [{ message: "not found" }] }) })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("lists self-hosted runners on runner.circleci.com", async () => {
    const seen: Request[] = [];
    const result = await actions["runners.list"]!({ apiKey: "secret", namespace: "acme", fetch: async (input, init) => { seen.push(new Request(input, init)); return response({ items: [{ name: "runner-1" }] }); } });
    expect(seen[0].url).toBe("https://runner.circleci.com/api/v3/runner?namespace=acme");
    expect(seen[0].headers.get("circle-token")).toBe("secret");
    expect(result).toMatchObject({ data: { items: [{ name: "runner-1" }] } });
  });

  test("upserts context env vars and deletes project env vars", async () => {
    const seen: Request[] = [];
    await actions["contexts.env_vars.upsert"]!({ apiKey: "secret", contextId: "ctx/1", envVarName: "TOKEN", value: "x", fetch: async (input, init) => { seen.push(new Request(input, init)); return response({ name: "TOKEN", value: "xxxx" }); } });
    expect(new URL(seen[0].url).pathname).toBe("/api/v2/context/ctx%2F1/environment-variable/TOKEN");
    expect(seen[0].method).toBe("PUT");
    expect(await seen[0].json()).toEqual({ value: "x" });
    await actions["projects.env_vars.delete"]!({ apiKey: "secret", projectSlug: "gh/acme/repo", name: "TOKEN", fetch: async (input, init) => { seen.push(new Request(input, init)); return response({ message: "deleted" }); } });
    expect(new URL(seen[1].url).pathname).toBe("/api/v2/project/gh%2Facme%2Frepo/envvar/TOKEN");
    expect(seen[1].method).toBe("DELETE");
  });

  test("empty pipeline errors array is success and extra healthcheck fields are rejected", async () => {
    const seen: Request[] = [];
    const body = { id: "pl-1", errors: [], state: "created" };
    const result = await actions["pipelines.get"]!({ apiKey: "secret", pipelineId: "pl-1", fetch: async (input, init) => { seen.push(new Request(input, init)); return response(body); } });
    expect(result).toMatchObject({ pipeline: body });
    await expect(actions.healthcheck!({ apiKey: "secret", unknownField: "nope", fetch: async () => response(user) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
  });

  test("plan metrics GraphQL sends nested dateRange as variables", async () => {
    const seen: Request[] = [];
    await actions["organizations.plan_metrics.query"]!({ apiKey: "secret", orgId: "org-1", dateRange: { start: "2026-02-01", end: "2026-02-07" }, fetch: async (input, init) => { seen.push(new Request(input, init)); return response({ data: { organization: { id: "org-1" } } }); } });
    expect(seen[0].url).toBe("https://circleci.com/graphql-unstable");
    expect(await seen[0].json()).toMatchObject({ variables: { orgId: "org-1", startDate: "2026-02-01", endDate: "2026-02-07" } });
  });

  test("insights workflow jobs encode slug and hyphenated query params", async () => {
    const seen: Request[] = [];
    await actions["insights.workflows.jobs.list"]!({ apiKey: "secret", projectSlug: "gh/acme/repo", workflowName: "build", allBranches: true, jobName: "lint", reportingWindow: "last-7-days", fetch: async (input, init) => { seen.push(new Request(input, init)); return response({ items: [] }); } });
    const url = new URL(seen[0].url);
    expect(url.pathname).toBe("/api/v2/insights/gh%2Facme%2Frepo/workflows/build/jobs");
    expect(url.searchParams.get("all-branches")).toBe("true");
    expect(url.searchParams.get("job-name")).toBe("lint");
    expect(url.searchParams.get("reporting-window")).toBe("last-7-days");
  });
});
