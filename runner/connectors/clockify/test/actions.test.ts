import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import user from "../fixtures/user.json";
import workspaces from "../fixtures/workspaces.json";
import project from "../fixtures/project.json";
import task from "../fixtures/task.json";
import timeEntry from "../fixtures/time-entry.json";
import client from "../fixtures/client.json";

const { actions } = compileDeclarativeConnector(manifest);
const res = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(body === "" ? "" : JSON.stringify(body), { status, headers });

describe("clockify HTTP contract", () => {
  test("auth header is X-Api-Key for existing reads", async () => {
    for (const name of ["healthcheck", "workspaces.list", "projects.list", "tasks.list"] as const) {
      const input: Record<string, unknown> = {
        apiKey: "secret",
        fetch: async (i: RequestInfo, x?: RequestInit) => {
          expect(new Request(i, x).headers.get("x-api-key")).toBe("secret");
          return res(name === "healthcheck" ? user : []);
        },
      };
      if (name.includes("projects") || name.includes("tasks")) {
        input.workspaceId = "w";
        if (name.includes("tasks")) input.projectId = "p";
      }
      await actions[name]!(input);
    }
  });

  test("encodes ids and maps create/get/delete", async () => {
    const seen: Request[] = [];
    const fetch = async (i: RequestInfo, x?: RequestInit) => {
      seen.push(new Request(i, x));
      return res(project, 201);
    };
    const created = await actions["projects.create"]!({ apiKey: "secret", workspaceId: "w/1", name: "Example", fetch });
    expect(seen[0].url).toBe("https://api.clockify.me/api/v1/workspaces/w%2F1/projects");
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(created).toMatchObject({ project, source: "provider" });

    seen.length = 0;
    await actions["timeEntries.get"]!({
      apiKey: "secret",
      workspaceId: "w1",
      id: "e1",
      fetch: async (i: RequestInfo, x?: RequestInit) => {
        seen.push(new Request(i, x));
        return res(timeEntry);
      },
    });
    expect(seen[0].url).toBe("https://api.clockify.me/api/v1/workspaces/w1/time-entries/e1");

    await expect(
      actions["timeEntries.delete"]!({
        apiKey: "secret",
        workspaceId: "w1",
        id: "e1",
        fetch: async () => res("", 204),
      }),
    ).resolves.toMatchObject({ ok: true, source: "provider" });
  });

  test("rejects missing required fields and maps rate limits", async () => {
    await expect(actions["projects.create"]!({ apiKey: "secret", workspaceId: "w" })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(
      actions["clients.list"]!({
        apiKey: "x",
        workspaceId: "w1",
        fetch: async () => res({ message: "slow" }, 429, { "retry-after": "7" }),
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
    await expect(
      actions["workspaces.get"]!({ apiKey: "x", workspaceId: "w1", fetch: async () => res([]) }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
  });

  test("lists clients, tags, users, and tasks", async () => {
    const listed = await actions["clients.list"]!({
      apiKey: "secret",
      workspaceId: "w1",
      fetch: async () => res([client]),
    });
    expect(listed).toMatchObject({ items: [client], source: "provider" });
    await actions["tags.list"]!({ apiKey: "secret", workspaceId: "w1", fetch: async () => res([]) });
    await actions["users.list"]!({ apiKey: "secret", workspaceId: "w1", fetch: async () => res([user]) });
    await actions["tasks.get"]!({
      apiKey: "secret",
      workspaceId: "w1",
      projectId: "p1",
      taskId: "t1",
      fetch: async () => res(task),
    });
    await actions["timeEntries.create"]!({
      apiKey: "secret",
      workspaceId: "w1",
      start: "2024-01-01T09:00:00Z",
      fetch: async () => res(timeEntry, 201),
    });
    await actions["workspaces.list"]!({ apiKey: "secret", fetch: async () => res(workspaces) });
  });
});
