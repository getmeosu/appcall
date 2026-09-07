import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import userMeFixture from "../fixtures/user_me.json";
import taskFixture from "../fixtures/task.json";
import tasksFixture from "../fixtures/tasks.json";
import tasksLastPageFixture from "../fixtures/tasks_last_page.json";
import projectFixture from "../fixtures/project.json";
import projectsFixture from "../fixtures/projects.json";
import sectionFixture from "../fixtures/section.json";
import sectionsFixture from "../fixtures/sections.json";
import storyFixture from "../fixtures/story.json";
import storiesFixture from "../fixtures/stories.json";
import workspacesFixture from "../fixtures/workspaces.json";
import emptyResponseFixture from "../fixtures/empty_response.json";
import unauthorizedFixture from "../fixtures/error_unauthorized.json";
import rateLimitedFixture from "../fixtures/error_rate_limited.json";

const { actions } = compileDeclarativeConnector(manifest as never);

type Call = { url: string; init?: RequestInit };

function mock(body: unknown, status = 200, headers: Record<string, string> = {}) {
  const calls: Call[] = [];
  const fetchFn = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(url), init });
    return new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...headers },
    });
  };
  return { calls, fetchFn };
}

function auth(calls: Call[]): string {
  return (calls[0]!.init?.headers as Record<string, string>).Authorization ?? "";
}

function sentBody(call: Call): unknown {
  return JSON.parse(String(call.init?.body));
}

describe("asana connector surface", () => {
  it("compiles one handler per declared operation", () => {
    expect(Object.keys(actions).sort()).toEqual(Object.keys(manifest.operations).sort());
  });
});

describe("authentication", () => {
  it("sends the token as a bearer credential — Asana uses Bearer for both PAT and OAuth", async () => {
    const { calls, fetchFn } = mock(userMeFixture);
    await actions.healthcheck!({ apiToken: "1/1201933996468857:abcdef", fetch: fetchFn });
    expect(auth(calls)).toBe("Bearer 1/1201933996468857:abcdef");
  });

  it("declares the credential under the field the setup form collects", () => {
    const secretFields = manifest.auth.setup.fields.filter((field) => field.secret);
    expect(secretFields.map((field) => field.key)).toEqual(["apiToken"]);
    expect(manifest.http.auth.field).toBe("apiToken");
  });
});

describe("healthcheck", () => {
  it("reports connector-owned status without a credential", () => {
    expect(actions.healthcheck!({})).toEqual({
      connector: "asana",
      action: "healthcheck",
      source: "connector",
      status: "ok",
    });
  });

  it("calls GET /users/me and reports the authenticated user, including workspaces for discovery", async () => {
    const { calls, fetchFn } = mock(userMeFixture);
    const result = await actions.healthcheck!({ apiToken: "tok", fetch: fetchFn }) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://app.asana.com/api/1.0/users/me");
    expect(calls[0]!.init?.method ?? "GET").toBe("GET");
    expect(result).toEqual({
      connector: "asana",
      action: "healthcheck",
      source: "provider",
      status: "ok",
      userGid: "12345",
      name: "Greg Sanchez",
      email: "gsanchez@example.com",
      workspaces: userMeFixture.data.workspaces,
    });
  });

  it("reads the id from gid, a string, not from a numeric id field", async () => {
    const { fetchFn } = mock(userMeFixture);
    const result = await actions.healthcheck!({ apiToken: "tok", fetch: fetchFn }) as Record<string, unknown>;
    expect(result.userGid).toBe("12345");
    expect(typeof result.userGid).toBe("string");
  });

  it("surfaces an unauthorized token as an upstream error with Asana's own message", async () => {
    const { fetchFn } = mock(unauthorizedFixture, 401);
    await expect(actions.healthcheck!({ apiToken: "bad", fetch: fetchFn }))
      .rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: "Not Authorized" });
  });
});

describe("tasks.create", () => {
  it("wraps the body in the data envelope and requires name", () => {
    expect(() => actions["tasks.create"]!({ apiToken: "tok", workspace: "1201933996468857" }))
      .toThrow("name is required");
  });

  it("posts the data envelope with camelCase input mapped to Asana's snake_case fields", async () => {
    const { calls, fetchFn } = mock(taskFixture, 201);
    const result = await actions["tasks.create"]!({
      apiToken: "tok",
      name: "Write the launch post",
      workspace: "1201933996468857",
      projects: ["1201933996468800"],
      assignee: "me",
      dueOn: "2026-09-10",
      fetch: fetchFn,
    }) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://app.asana.com/api/1.0/tasks");
    expect(calls[0]!.init?.method).toBe("POST");
    expect(sentBody(calls[0]!)).toEqual({
      data: {
        name: "Write the launch post",
        workspace: "1201933996468857",
        projects: ["1201933996468800"],
        assignee: "me",
        due_on: "2026-09-10",
      },
    });
    expect(result.task).toEqual(taskFixture.data);
  });

  it("reads the created task's id from gid, never from a numeric id", async () => {
    const { fetchFn } = mock(taskFixture, 201);
    const result = await actions["tasks.create"]!({
      apiToken: "tok", name: "Write the launch post", workspace: "1201933996468857", fetch: fetchFn,
    }) as Record<string, unknown>;
    const task = result.task as Record<string, unknown>;
    expect(task.gid).toBe("1201933996468858");
    expect(typeof task.gid).toBe("string");
    expect(task.permalink_url).toBe("https://app.asana.com/1/1201933996468857/task/1201933996468858");
  });

  it("omits fields the caller left out rather than sending null", async () => {
    const { calls, fetchFn } = mock(taskFixture, 201);
    await actions["tasks.create"]!({ apiToken: "tok", name: "Write the launch post", fetch: fetchFn });
    expect(sentBody(calls[0]!)).toEqual({ data: { name: "Write the launch post" } });
  });

  it("rejects a rate-limited response and reads the seconds to wait from retry-after", async () => {
    const { fetchFn } = mock(rateLimitedFixture, 429, { "retry-after": "30" });
    await expect(actions["tasks.create"]!({ apiToken: "tok", name: "x", workspace: "w", fetch: fetchFn }))
      .rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 30 });
  });
});

describe("tasks.update", () => {
  it("requires the task gid", () => {
    expect(() => actions["tasks.update"]!({ apiToken: "tok", completed: true })).toThrow("taskGid is required");
  });

  it("PUTs only the fields the caller supplied, wrapped in data", async () => {
    const { calls, fetchFn } = mock(taskFixture);
    await actions["tasks.update"]!({ apiToken: "tok", taskGid: "1201933996468858", completed: true, fetch: fetchFn });
    expect(calls[0]!.url).toBe("https://app.asana.com/api/1.0/tasks/1201933996468858");
    expect(calls[0]!.init?.method).toBe("PUT");
    expect(sentBody(calls[0]!)).toEqual({ data: { completed: true } });
  });
});

describe("tasks.get", () => {
  it("reads a single task by gid", async () => {
    const { calls, fetchFn } = mock(taskFixture);
    const result = await actions["tasks.get"]!({ apiToken: "tok", taskGid: "1201933996468858", fetch: fetchFn }) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://app.asana.com/api/1.0/tasks/1201933996468858");
    expect(result.task).toEqual(taskFixture.data);
  });

  it("requests permalink_url through opt_fields when the caller asks for it", async () => {
    const { calls, fetchFn } = mock(taskFixture);
    await actions["tasks.get"]!({ apiToken: "tok", taskGid: "1201933996468858", optFields: "permalink_url", fetch: fetchFn });
    expect(new URL(calls[0]!.url).searchParams.get("opt_fields")).toBe("permalink_url");
  });

  it("surfaces the not-found upstream error", async () => {
    const { fetchFn } = mock({ errors: [{ message: "task: Not Found" }] }, 404);
    await expect(actions["tasks.get"]!({ apiToken: "tok", taskGid: "nope", fetch: fetchFn }))
      .rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: "task: Not Found" });
  });
});

describe("tasks.listByProject — pagination", () => {
  it("requires the project gid", () => {
    expect(() => actions["tasks.listByProject"]!({ apiToken: "tok" })).toThrow("projectGid is required");
  });

  it("rejects a call with no limit before ever issuing a request, rather than silently paginating wrong", async () => {
    const { calls, fetchFn } = mock(tasksFixture);
    await expect(actions["tasks.listByProject"]!({ apiToken: "tok", projectGid: "1201933996468800", fetch: fetchFn }))
      .rejects.toMatchObject({ ok: false, code: "INVALID_ACTION_INPUT" });
    expect(calls.length).toBe(0);
  });

  it("always sends limit, since Asana only paginates when it is supplied", async () => {
    const { calls, fetchFn } = mock(tasksFixture);
    await actions["tasks.listByProject"]!({ apiToken: "tok", projectGid: "1201933996468800", limit: 2, fetch: fetchFn });
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/api/1.0/projects/1201933996468800/tasks");
    expect(url.searchParams.get("limit")).toBe("2");
  });

  it("passes the opaque offset token back verbatim, never as a numeric index", async () => {
    const { calls, fetchFn } = mock(tasksFixture);
    await actions["tasks.listByProject"]!({
      apiToken: "tok", projectGid: "1201933996468800", limit: 2, offset: "eyJ0eXAiOJiKV1iQLCJhbGciOiJIUzI1NiJ9", fetch: fetchFn,
    });
    expect(new URL(calls[0]!.url).searchParams.get("offset")).toBe("eyJ0eXAiOJiKV1iQLCJhbGciOiJIUzI1NiJ9");
  });

  it("hands back next_page.offset as nextOffset when more pages exist", async () => {
    const { fetchFn } = mock(tasksFixture);
    const result = await actions["tasks.listByProject"]!({
      apiToken: "tok", projectGid: "1201933996468800", limit: 2, fetch: fetchFn,
    }) as Record<string, unknown>;
    expect(result.tasks).toEqual(tasksFixture.data);
    expect(result.nextOffset).toBe(tasksFixture.next_page.offset);
  });

  it("omits nextOffset entirely on the last page, where next_page is null", async () => {
    const { fetchFn } = mock(tasksLastPageFixture);
    const result = await actions["tasks.listByProject"]!({
      apiToken: "tok", projectGid: "1201933996468800", limit: 2, fetch: fetchFn,
    }) as Record<string, unknown>;
    expect(result.tasks).toEqual(tasksLastPageFixture.data);
    expect("nextOffset" in result).toBe(false);
  });

  it("every task gid in the list is a string, never a number", async () => {
    const { fetchFn } = mock(tasksFixture);
    const result = await actions["tasks.listByProject"]!({
      apiToken: "tok", projectGid: "1201933996468800", limit: 2, fetch: fetchFn,
    }) as Record<string, unknown>;
    for (const task of result.tasks as Record<string, unknown>[]) {
      expect(typeof task.gid).toBe("string");
    }
  });
});

describe("tasks.listSubtasks", () => {
  it("lists subtasks of a parent task", async () => {
    const { calls, fetchFn } = mock(tasksFixture);
    const result = await actions["tasks.listSubtasks"]!({
      apiToken: "tok", taskGid: "1201933996468858", limit: 50, fetch: fetchFn,
    }) as Record<string, unknown>;
    expect(new URL(calls[0]!.url).pathname).toBe("/api/1.0/tasks/1201933996468858/subtasks");
    expect(result.subtasks).toEqual(tasksFixture.data);
    expect(result.nextOffset).toBe(tasksFixture.next_page.offset);
  });
});

describe("projects", () => {
  it("projects.list reads the project collection scoped to a workspace", async () => {
    const { calls, fetchFn } = mock(projectsFixture);
    const result = await actions["projects.list"]!({
      apiToken: "tok", workspace: "1201933996468857", limit: 50, fetch: fetchFn,
    }) as Record<string, unknown>;
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/api/1.0/projects");
    expect(url.searchParams.get("workspace")).toBe("1201933996468857");
    expect(result.projects).toEqual(projectsFixture.data);
    expect("nextOffset" in result).toBe(false);
  });

  it("projects.get reads one project by gid", async () => {
    const { calls, fetchFn } = mock(projectFixture);
    const result = await actions["projects.get"]!({ apiToken: "tok", projectGid: "1201933996468800", fetch: fetchFn }) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://app.asana.com/api/1.0/projects/1201933996468800");
    expect(result.project).toEqual(projectFixture.data);
  });

  it("projects.create requires name and workspace, wrapped in the data envelope", () => {
    expect(() => actions["projects.create"]!({ apiToken: "tok", workspace: "w" })).toThrow("name is required");
    expect(() => actions["projects.create"]!({ apiToken: "tok", name: "Q3 Launch" })).toThrow("workspace is required");
  });

  it("projects.create posts name, workspace, and team wrapped in data", async () => {
    const { calls, fetchFn } = mock(projectFixture, 201);
    const result = await actions["projects.create"]!({
      apiToken: "tok", name: "Q3 Launch", workspace: "1201933996468857", team: "1201933996468801", fetch: fetchFn,
    }) as Record<string, unknown>;
    expect(sentBody(calls[0]!)).toEqual({
      data: { name: "Q3 Launch", workspace: "1201933996468857", team: "1201933996468801" },
    });
    expect(result.project).toEqual(projectFixture.data);
  });
});

describe("sections", () => {
  it("sections.list scopes to the given project", async () => {
    const { calls, fetchFn } = mock(sectionsFixture);
    const result = await actions["sections.list"]!({
      apiToken: "tok", projectGid: "1201933996468800", limit: 50, fetch: fetchFn,
    }) as Record<string, unknown>;
    expect(new URL(calls[0]!.url).pathname).toBe("/api/1.0/projects/1201933996468800/sections");
    expect(result.sections).toEqual(sectionsFixture.data);
  });

  it("sections.create requires the project and the name", () => {
    expect(() => actions["sections.create"]!({ apiToken: "tok", name: "In review" })).toThrow("projectGid is required");
    expect(() => actions["sections.create"]!({ apiToken: "tok", projectGid: "p" })).toThrow("name is required");
  });

  it("sections.create posts the name wrapped in data under the project path", async () => {
    const { calls, fetchFn } = mock(sectionFixture, 201);
    const result = await actions["sections.create"]!({
      apiToken: "tok", projectGid: "1201933996468800", name: "In review", fetch: fetchFn,
    }) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://app.asana.com/api/1.0/projects/1201933996468800/sections");
    expect(sentBody(calls[0]!)).toEqual({ data: { name: "In review" } });
    expect(result.section).toEqual(sectionFixture.data);
  });

  it("sections.addTask requires sectionGid and task", () => {
    expect(() => actions["sections.addTask"]!({ apiToken: "tok", task: "t" })).toThrow("sectionGid is required");
    expect(() => actions["sections.addTask"]!({ apiToken: "tok", sectionGid: "s" })).toThrow("task is required");
  });

  it("sections.addTask posts to the addTask path and does not try to read a gid from the empty response", async () => {
    const { calls, fetchFn } = mock(emptyResponseFixture, 200);
    const result = await actions["sections.addTask"]!({
      apiToken: "tok", sectionGid: "1201933996468900", task: "1201933996468858", fetch: fetchFn,
    }) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://app.asana.com/api/1.0/sections/1201933996468900/addTask");
    expect(sentBody(calls[0]!)).toEqual({ data: { task: "1201933996468858" } });
    expect(result).toEqual({
      connector: "asana",
      action: "sections.addTask",
      source: "provider",
      added: true,
      sectionGid: "1201933996468900",
      taskGid: "1201933996468858",
    });
  });
});

describe("stories", () => {
  it("stories.listForTask returns both system activity and comments, which callers filter on resource_subtype", async () => {
    const { calls, fetchFn } = mock(storiesFixture);
    const result = await actions["stories.listForTask"]!({
      apiToken: "tok", taskGid: "1201933996468858", limit: 50, fetch: fetchFn,
    }) as Record<string, unknown>;
    expect(new URL(calls[0]!.url).pathname).toBe("/api/1.0/tasks/1201933996468858/stories");
    expect(result.stories).toEqual(storiesFixture.data);
    const comments = (result.stories as Record<string, unknown>[]).filter((s) => s.resource_subtype === "comment_added");
    expect(comments.length).toBe(1);
  });

  it("stories.create requires text and wraps it in data", () => {
    expect(() => actions["stories.create"]!({ apiToken: "tok", taskGid: "t" })).toThrow("text is required");
  });

  it("stories.create posts the comment text under the task's stories path", async () => {
    const { calls, fetchFn } = mock(storyFixture, 201);
    const result = await actions["stories.create"]!({
      apiToken: "tok", taskGid: "1201933996468858", text: "Shipped, moving to review.", fetch: fetchFn,
    }) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://app.asana.com/api/1.0/tasks/1201933996468858/stories");
    expect(sentBody(calls[0]!)).toEqual({ data: { text: "Shipped, moving to review." } });
    expect(result.story).toEqual(storyFixture.data);
  });
});

describe("workspaces.list", () => {
  it("reads the workspace collection", async () => {
    const { calls, fetchFn } = mock(workspacesFixture);
    const result = await actions["workspaces.list"]!({ apiToken: "tok", limit: 50, fetch: fetchFn }) as Record<string, unknown>;
    expect(new URL(calls[0]!.url).pathname).toBe("/api/1.0/workspaces");
    expect(result.workspaces).toEqual(workspacesFixture.data);
  });
});

describe("error mapping", () => {
  it("surfaces Asana's errors.0.message rather than a generic upstream message", async () => {
    const { fetchFn } = mock(unauthorizedFixture, 401);
    await expect(actions["tasks.get"]!({ apiToken: "bad", taskGid: "1201933996468858", fetch: fetchFn }))
      .rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: "Not Authorized" });
  });

  it("classifies 429 as a rate limit and reads the retry-after header in seconds", async () => {
    const { fetchFn } = mock(rateLimitedFixture, 429, { "retry-after": "5" });
    await expect(actions["projects.list"]!({ apiToken: "tok", limit: 50, fetch: fetchFn }))
      .rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 5 });
  });

  it("falls back to the declared default when the retry header is absent", async () => {
    const { fetchFn } = mock(rateLimitedFixture, 429);
    await expect(actions["projects.list"]!({ apiToken: "tok", limit: 50, fetch: fetchFn }))
      .rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: manifest.http.errors.defaultRetryAfterSeconds });
  });

  it("falls back to errors.0.phrase when errors.0.message is absent, which Asana adds on 5xx", async () => {
    const { fetchFn } = mock({ errors: [{ phrase: "6-abc123 - server hiccup" }] }, 500);
    await expect(actions["projects.list"]!({ apiToken: "tok", limit: 50, fetch: fetchFn }))
      .rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: "6-abc123 - server hiccup" });
  });

  it("refuses a host outside the manifest's allow list", async () => {
    const offHost = { ...manifest, network: { allowedHosts: ["example.invalid"] } };
    const compiled = compileDeclarativeConnector(offHost as never);
    await expect(compiled.actions["projects.list"]!({ apiToken: "tok", limit: 50, fetch: async () => new Response("{}") }))
      .rejects.toMatchObject({ code: "OUTBOUND_HOST_NOT_ALLOWED" });
  });
});
