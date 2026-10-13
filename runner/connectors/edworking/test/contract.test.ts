import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest);
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

const projects = {
  data: {
    apiProjects: [
      {
        id: "proj_1",
        name: "Example",
        createdAt: "2026-01-15T12:00:00.000Z",
        updatedAt: "2026-01-15T12:00:00.000Z",
      },
    ],
  },
};

describe("Edworking contract", () => {
  test("lists projects with bearer auth on the official gateway", async () => {
    const seen: Request[] = [];
    const result = await actions["projects.list"]!({
      apiKey: "edw_pat_secret",
      limit: 1,
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response(projects);
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("POST");
    expect(seen[0].url).toBe("https://gateway.edworking.com/");
    expect(seen[0].headers.get("authorization")).toBe("Bearer edw_pat_secret");
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(seen[0].headers.get("accept")).toBe("application/json");
    const body = await seen[0].json();
    expect(body.query).toContain("apiProjects");
    expect(body.variables).toEqual({ limit: 1 });
    expect(result).toEqual({
      connector: "edworking",
      action: "projects.list",
      source: "provider",
      projects: projects.data.apiProjects,
    });
  });

  test("keeps caller values in GraphQL variables and stays on one route", async () => {
    const seen: Request[] = [];
    const taskId = 'task/../evil"';
    await actions["tasks.get"]!({
      apiKey: "tok",
      taskId,
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({ data: { apiTask: { id: taskId, name: "n", users: [] } } });
      },
    });
    expect(seen).toHaveLength(1);
    expect(new URL(seen[0].url).hostname).toBe("gateway.edworking.com");
    expect(new URL(seen[0].url).pathname).toBe("/");
    const body = await seen[0].json();
    expect(body.query).not.toContain("evil");
    expect(body.variables).toEqual({ id: taskId });
  });

  test("sends a project message without putting the text in the document", async () => {
    const seen: Request[] = [];
    const text = 'ready "now"';
    await actions["messages.send"]!({
      apiKey: "tok",
      projectId: "proj_1",
      body: text,
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({
          data: { apiSendMessage: { id: "msg_1", body: text, authorId: "user_1", createdAt: "2026-01-15T12:00:00.000Z" } },
        });
      },
    });
    const body = await seen[0].json();
    expect(body.query).toContain('kind: "project"');
    expect(body.query).not.toContain("ready");
    expect(body.variables).toEqual({ projectId: "proj_1", body: text });
    expect(seen).toHaveLength(1);
  });

  test("returns null when apiTask finds no task", async () => {
    const result = await actions["tasks.get"]!({
      apiKey: "tok",
      taskId: "missing",
      fetch: async () => response({ data: { apiTask: null } }),
    });
    expect(result).toEqual({
      connector: "edworking",
      action: "tasks.get",
      source: "provider",
      data: { apiTask: null },
    });
  });

  test("rejects invalid input, a non-object payload, 401, 429, and GraphQL errors", async () => {
    await expect(actions["tasks.create"]!({
      apiKey: "tok",
      projectId: "proj_1",
      name: "",
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["projects.list"]!({
      apiKey: "tok",
      fetch: async () => response([]),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["projects.list"]!({
      apiKey: "tok",
      fetch: async () => response({}, 401),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["projects.list"]!({
      apiKey: "tok",
      fetch: async () => response({}, 429, { "Retry-After": "4" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
    await expect(actions["projects.list"]!({
      apiKey: "tok",
      fetch: async () => response({ data: null, errors: [{ message: "forbidden" }] }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
