import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import user from "../fixtures/user.json";
import project from "../fixtures/project.json";
import pipelines from "../fixtures/pipelines.json";
import pipeline from "../fixtures/pipeline.json";

const { actions } = compileDeclarativeConnector(manifest);
const response = (body: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(body), { status, headers });

describe("CircleCI declarative read-only contract", () => {
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
});
