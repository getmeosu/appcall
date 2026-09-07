import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import userFixture from "../fixtures/user.json";
import teamsFixture from "../fixtures/teams.json";
import spacesFixture from "../fixtures/spaces.json";
import foldersFixture from "../fixtures/folders.json";
import listsFixture from "../fixtures/lists.json";
import listFixture from "../fixtures/list.json";
import taskFixture from "../fixtures/task.json";
import tasksFixture from "../fixtures/tasks.json";
import commentsFixture from "../fixtures/comments.json";
import commentFixture from "../fixtures/comment.json";
import timeEntryFixture from "../fixtures/time_entry.json";
import unauthorizedFixture from "../fixtures/error_unauthorized.json";

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

describe("clickup connector surface", () => {
  it("compiles one handler per declared operation", () => {
    expect(Object.keys(actions).sort()).toEqual(Object.keys(manifest.operations).sort());
  });
});

describe("authentication", () => {
  it("sends the personal token raw, with no Bearer prefix", async () => {
    const { calls, fetchFn } = mock(userFixture);
    await actions.healthcheck!({ apiKey: "pk_12345_ABCDEF", fetch: fetchFn });
    expect(auth(calls)).toBe("pk_12345_ABCDEF");
    expect(auth(calls)).not.toContain("Bearer");
  });

  it("declares the credential under the field the setup form collects", () => {
    const secretFields = manifest.auth.setup.fields.filter((field) => field.secret);
    expect(secretFields.map((field) => field.key)).toEqual(["apiKey"]);
    expect(manifest.http.auth.field).toBe("apiKey");
  });
});

describe("healthcheck", () => {
  it("reports connector-owned status without a credential", () => {
    expect(actions.healthcheck!({})).toEqual({
      connector: "clickup",
      action: "healthcheck",
      source: "connector",
      status: "ok",
    });
  });

  it("calls GET /v2/user and reports the authenticated user", async () => {
    const { calls, fetchFn } = mock(userFixture);
    const result = await actions.healthcheck!({ apiKey: "pk_x", fetch: fetchFn }) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://api.clickup.com/api/v2/user");
    expect(result).toEqual({
      connector: "clickup",
      action: "healthcheck",
      source: "provider",
      status: "ok",
      userId: 183,
      username: "Ada Lovelace",
    });
  });
});

describe("hierarchy discovery", () => {
  it("workspaces.list unwraps the teams array", async () => {
    const { calls, fetchFn } = mock(teamsFixture);
    const result = await actions["workspaces.list"]!({ apiKey: "pk_x", fetch: fetchFn }) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://api.clickup.com/api/v2/team");
    expect(result.workspaces).toEqual(teamsFixture.teams);
  });

  it("spaces.list reads a workspace's spaces", async () => {
    const { calls, fetchFn } = mock(spacesFixture);
    const result = await actions["spaces.list"]!({ apiKey: "pk_x", teamId: "1234", fetch: fetchFn }) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://api.clickup.com/api/v2/team/1234/space");
    expect(result.spaces).toEqual(spacesFixture.spaces);
  });

  it("passes archived through only when supplied", async () => {
    const { calls, fetchFn } = mock(spacesFixture);
    await actions["spaces.list"]!({ apiKey: "pk_x", teamId: "1234", fetch: fetchFn });
    expect(new URL(calls[0]!.url).searchParams.has("archived")).toBe(false);

    await actions["spaces.list"]!({ apiKey: "pk_x", teamId: "1234", archived: true, fetch: fetchFn });
    expect(new URL(calls[1]!.url).searchParams.get("archived")).toBe("true");
  });

  it("folders.list reads a space's folders", async () => {
    const { calls, fetchFn } = mock(foldersFixture);
    const result = await actions["folders.list"]!({ apiKey: "pk_x", spaceId: "790", fetch: fetchFn }) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://api.clickup.com/api/v2/space/790/folder");
    expect(result.folders).toEqual(foldersFixture.folders);
  });

  it("lists.list and lists.list-folderless read the two places a List can live", async () => {
    const { calls, fetchFn } = mock(listsFixture);
    await actions["lists.list"]!({ apiKey: "pk_x", folderId: "457", fetch: fetchFn });
    await actions["lists.list-folderless"]!({ apiKey: "pk_x", spaceId: "790", fetch: fetchFn });
    expect(calls[0]!.url).toBe("https://api.clickup.com/api/v2/folder/457/list");
    expect(calls[1]!.url).toBe("https://api.clickup.com/api/v2/space/790/list");
  });

  it("lists.get returns the list body", async () => {
    const { calls, fetchFn } = mock(listFixture);
    const result = await actions["lists.get"]!({ apiKey: "pk_x", listId: "901300000000", fetch: fetchFn }) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://api.clickup.com/api/v2/list/901300000000");
    expect((result.list as Record<string, unknown>).name).toBe("Q4 Launch");
  });

  it("lists.create posts the folder-scoped body", async () => {
    const { calls, fetchFn } = mock(listFixture);
    await actions["lists.create"]!({ apiKey: "pk_x", folderId: "457", name: "Q4 Launch", priority: 3, fetch: fetchFn });
    expect(calls[0]!.init?.method).toBe("POST");
    expect(calls[0]!.url).toBe("https://api.clickup.com/api/v2/folder/457/list");
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ name: "Q4 Launch", priority: 3 });
  });
});

describe("tasks.list", () => {
  it("returns the validated payload without a credential", () => {
    const result = actions["tasks.list"]!({ listId: "901300000000", page: 0 }) as Record<string, unknown>;
    expect(result.source).toBe("connector");
    expect(result.validated).toEqual({ listId: "901300000000", page: 0 });
  });

  it("requires listId", () => {
    expect(() => actions["tasks.list"]!({ page: 0 })).toThrow("listId is required");
  });

  it("returns tasks and the last-page flag", async () => {
    const { calls, fetchFn } = mock(tasksFixture);
    const result = await actions["tasks.list"]!({ apiKey: "pk_x", listId: "901300000000", fetch: fetchFn }) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://api.clickup.com/api/v2/list/901300000000/task");
    expect(result.tasks).toEqual(tasksFixture.tasks);
    expect(result.lastPage).toBe(true);
  });

  it("repeats an array filter key, which is ClickUp's form/explode serialisation", async () => {
    const { calls, fetchFn } = mock(tasksFixture);
    await actions["tasks.list"]!({
      apiKey: "pk_x",
      listId: "901300000000",
      statuses: ["to do", "in progress"],
      tags: ["launch"],
      includeClosed: true,
      fetch: fetchFn,
    });
    const url = new URL(calls[0]!.url);
    expect(url.searchParams.getAll("statuses")).toEqual(["to do", "in progress"]);
    expect(url.searchParams.getAll("tags")).toEqual(["launch"]);
    expect(url.searchParams.get("include_closed")).toBe("true");
  });

  it("rejects an out-of-vocabulary sort field before calling out", async () => {
    const { calls, fetchFn } = mock(tasksFixture);
    await expect(
      actions["tasks.list"]!({ apiKey: "pk_x", listId: "1", orderBy: "sideways", fetch: fetchFn }),
    ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT", message: "orderBy must be one of: id, created, updated, due_date" });
    expect(calls).toHaveLength(0);
  });
});

describe("tasks.search", () => {
  it("uses the bracketed array parameter names this endpoint declares", async () => {
    const { calls, fetchFn } = mock(tasksFixture);
    await actions["tasks.search"]!({
      apiKey: "pk_x",
      teamId: "1234",
      listIds: ["901300000000"],
      statuses: ["to do"],
      fetch: fetchFn,
    });
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/api/v2/team/1234/task");
    expect(url.searchParams.getAll("list_ids[]")).toEqual(["901300000000"]);
    expect(url.searchParams.getAll("statuses[]")).toEqual(["to do"]);
  });
});

describe("task lifecycle", () => {
  it("tasks.get fetches one task", async () => {
    const { calls, fetchFn } = mock(taskFixture);
    const result = await actions["tasks.get"]!({ apiKey: "pk_x", taskId: "9hz", includeSubtasks: true, fetch: fetchFn }) as Record<string, unknown>;
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/api/v2/task/9hz");
    expect(url.searchParams.get("include_subtasks")).toBe("true");
    expect((result.task as Record<string, unknown>).id).toBe("9hz");
  });

  it("tasks.create sends only the fields supplied, under ClickUp's snake_case names", async () => {
    const { calls, fetchFn } = mock(taskFixture);
    const result = await actions["tasks.create"]!({
      apiKey: "pk_x",
      listId: "901300000000",
      name: "Write the launch post",
      priority: 3,
      timeEstimate: 3600000,
      assignees: [183],
      tags: ["launch"],
      fetch: fetchFn,
    }) as Record<string, unknown>;

    expect(calls[0]!.init?.method).toBe("POST");
    expect(calls[0]!.url).toBe("https://api.clickup.com/api/v2/list/901300000000/task");
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({
      name: "Write the launch post",
      priority: 3,
      time_estimate: 3600000,
      assignees: [183],
      tags: ["launch"],
    });
    expect((result.task as Record<string, unknown>).url).toBe("https://app.clickup.com/t/9hz");
  });

  it("tasks.create requires a list and a name", () => {
    expect(() => actions["tasks.create"]!({ name: "x" })).toThrow("listId is required");
    expect(() => actions["tasks.create"]!({ listId: "1" })).toThrow("name is required");
  });

  it("tasks.create rejects a priority outside ClickUp's scale", async () => {
    await expect(
      actions["tasks.create"]!({ apiKey: "pk_x", listId: "1", name: "x", priority: 9, fetch: async () => new Response("{}") }),
    ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT", message: "priority must be one of: 1, 2, 3, 4" });
  });

  it("tasks.update PUTs only the changed fields", async () => {
    const { calls, fetchFn } = mock(taskFixture);
    await actions["tasks.update"]!({ apiKey: "pk_x", taskId: "9hz", status: "in progress", fetch: fetchFn });
    expect(calls[0]!.init?.method).toBe("PUT");
    expect(calls[0]!.url).toBe("https://api.clickup.com/api/v2/task/9hz");
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ status: "in progress" });
  });

  it("tasks.delete accepts the empty 204 body and echoes the deleted ID", async () => {
    const { calls, fetchFn } = mock(null, 204);
    const result = await actions["tasks.delete"]!({ apiKey: "pk_x", taskId: "9hz", fetch: fetchFn }) as Record<string, unknown>;
    expect(calls[0]!.init?.method).toBe("DELETE");
    expect(result).toEqual({
      connector: "clickup",
      action: "tasks.delete",
      source: "provider",
      deleted: true,
      taskId: "9hz",
    });
  });
});

describe("comments", () => {
  it("comments.list reads a task's comments", async () => {
    const { calls, fetchFn } = mock(commentsFixture);
    const result = await actions["comments.list"]!({ apiKey: "pk_x", taskId: "9hz", fetch: fetchFn }) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://api.clickup.com/api/v2/task/9hz/comment");
    expect(result.comments).toEqual(commentsFixture.comments);
  });

  it("comments.list passes the paging pair through", async () => {
    const { calls, fetchFn } = mock(commentsFixture);
    await actions["comments.list"]!({ apiKey: "pk_x", taskId: "9hz", start: 1786400900000, startId: "458", fetch: fetchFn });
    const url = new URL(calls[0]!.url);
    expect(url.searchParams.get("start")).toBe("1786400900000");
    expect(url.searchParams.get("start_id")).toBe("458");
  });

  it("comments.create requires the notify flag ClickUp marks required", () => {
    expect(() => actions["comments.create"]!({ taskId: "9hz", commentText: "hi" })).toThrow("notifyAll is required");
  });

  it("comments.create posts the comment", async () => {
    const { calls, fetchFn } = mock(commentFixture);
    const result = await actions["comments.create"]!({
      apiKey: "pk_x",
      taskId: "9hz",
      commentText: "Shipped, moving to review.",
      notifyAll: false,
      fetch: fetchFn,
    }) as Record<string, unknown>;
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({
      comment_text: "Shipped, moving to review.",
      notify_all: false,
    });
    expect((result.comment as Record<string, unknown>).id).toBe("459");
  });
});

describe("time tracking", () => {
  it("start sends the task ID under ClickUp's tid field", async () => {
    const { calls, fetchFn } = mock(timeEntryFixture);
    const result = await actions["time-entries.start"]!({
      apiKey: "pk_x", teamId: "1234", taskId: "9hz", description: "Drafting", fetch: fetchFn,
    }) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://api.clickup.com/api/v2/team/1234/time_entries/start");
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ tid: "9hz", description: "Drafting" });
    expect((result.timeEntry as Record<string, unknown>).id).toBe("3126464893392470000");
  });

  it("stop posts with no body", async () => {
    const { calls, fetchFn } = mock(timeEntryFixture);
    await actions["time-entries.stop"]!({ apiKey: "pk_x", teamId: "1234", fetch: fetchFn });
    expect(calls[0]!.url).toBe("https://api.clickup.com/api/v2/team/1234/time_entries/stop");
    expect(calls[0]!.init?.method).toBe("POST");
    expect(calls[0]!.init?.body).toBeUndefined();
  });

  it("current unwraps the data envelope", async () => {
    const { calls, fetchFn } = mock(timeEntryFixture);
    const result = await actions["time-entries.current"]!({ apiKey: "pk_x", teamId: "1234", assignee: 183, fetch: fetchFn }) as Record<string, unknown>;
    expect(new URL(calls[0]!.url).pathname).toBe("/api/v2/team/1234/time_entries/current");
    expect(new URL(calls[0]!.url).searchParams.get("assignee")).toBe("183");
    expect((result.timeEntry as Record<string, unknown>).description).toBe("Drafting");
  });
});

describe("error mapping", () => {
  it("surfaces ClickUp's err field rather than a generic upstream message", async () => {
    const { fetchFn } = mock(unauthorizedFixture, 401);
    await expect(actions["tasks.get"]!({ apiKey: "pk_bad", taskId: "9hz", fetch: fetchFn }))
      .rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: "Team not authorized" });
  });

  it("converts the X-RateLimit-Reset epoch into a wait in seconds", async () => {
    const resetAt = Math.floor(Date.now() / 1000) + 37;
    const { fetchFn } = mock({ err: "Rate limit reached" }, 429, { "x-ratelimit-reset": String(resetAt) });
    await expect(actions["tasks.list"]!({ apiKey: "pk_x", listId: "1", fetch: fetchFn }))
      .rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 37 });
  });

  it("falls back to a one minute wait when the reset header is absent", async () => {
    const { fetchFn } = mock({ err: "Rate limit reached" }, 429);
    await expect(actions["tasks.list"]!({ apiKey: "pk_x", listId: "1", fetch: fetchFn }))
      .rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 60 });
  });

  it("refuses a host outside the manifest's allow list", async () => {
    const offHost = { ...manifest, network: { allowedHosts: ["example.invalid"] } };
    const compiled = compileDeclarativeConnector(offHost as never);
    await expect(compiled.actions["workspaces.list"]!({ apiKey: "pk_x", fetch: async () => new Response("{}") }))
      .rejects.toMatchObject({ code: "OUTBOUND_HOST_NOT_ALLOWED" });
  });
});
