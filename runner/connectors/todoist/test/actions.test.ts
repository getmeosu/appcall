import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import userFixture from "../fixtures/user.json";
import projectsFixture from "../fixtures/projects.json";
import projectFixture from "../fixtures/project.json";
import sectionsFixture from "../fixtures/sections.json";
import sectionFixture from "../fixtures/section.json";
import tasksFixture from "../fixtures/tasks.json";
import taskFixture from "../fixtures/task.json";
import labelsFixture from "../fixtures/labels.json";
import labelFixture from "../fixtures/label.json";
import commentsFixture from "../fixtures/comments.json";
import commentFixture from "../fixtures/comment.json";
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

function sentBody(call: Call): unknown {
  return JSON.parse(String(call.init?.body));
}

describe("todoist connector surface", () => {
  it("compiles one handler per declared operation", () => {
    expect(Object.keys(actions).sort()).toEqual(Object.keys(manifest.operations).sort());
  });
});

describe("authentication", () => {
  it("sends the personal token as a bearer credential", async () => {
    const { calls, fetchFn } = mock(userFixture);
    await actions.healthcheck!({ apiKey: "0123456789abcdef", fetch: fetchFn });
    expect(auth(calls)).toBe("Bearer 0123456789abcdef");
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
      connector: "todoist",
      action: "healthcheck",
      source: "connector",
      status: "ok",
    });
  });

  it("calls GET /api/v1/user and reports the authenticated user", async () => {
    const { calls, fetchFn } = mock(userFixture);
    const result = await actions.healthcheck!({ apiKey: "tok", fetch: fetchFn }) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://api.todoist.com/api/v1/user");
    expect(result).toEqual({
      connector: "todoist",
      action: "healthcheck",
      source: "provider",
      status: "ok",
      userId: "1234567",
      email: "user@example.com",
      fullName: "Maria Garcia",
    });
  });

  it("drops the API token the user endpoint returns instead of handing it back", async () => {
    // GET /api/v1/user includes the caller's own personal token under "token".
    const { fetchFn } = mock({ ...userFixture, token: "0123456789abcdef0123456789abcdef01234567" });
    const result = await actions.healthcheck!({ apiKey: "tok", fetch: fetchFn });
    expect(JSON.stringify(result)).not.toContain("0123456789abcdef");
  });
});

describe("pagination", () => {
  it("passes the cursor and limit through as query parameters", async () => {
    const { calls, fetchFn } = mock(tasksFixture);
    await actions["tasks.list"]!({ apiKey: "tok", cursor: "abc.def", limit: 100, fetch: fetchFn });
    const url = new URL(calls[0]!.url);
    expect(url.searchParams.get("cursor")).toBe("abc.def");
    expect(url.searchParams.get("limit")).toBe("100");
  });

  it("omits the paging pair when the caller does not supply it", async () => {
    const { calls, fetchFn } = mock(tasksFixture);
    await actions["tasks.list"]!({ apiKey: "tok", fetch: fetchFn });
    const url = new URL(calls[0]!.url);
    expect(url.searchParams.has("cursor")).toBe(false);
    expect(url.searchParams.has("limit")).toBe(false);
  });

  it("hands back the cursor for the next page", async () => {
    const { fetchFn } = mock(tasksFixture);
    const result = await actions["tasks.list"]!({ apiKey: "tok", fetch: fetchFn }) as Record<string, unknown>;
    expect(result.tasks).toEqual(tasksFixture.results);
    expect(result.nextCursor).toBe(tasksFixture.next_cursor);
  });

  it("omits nextCursor entirely on the last page, where Todoist sends null", async () => {
    const { fetchFn } = mock(projectsFixture);
    const result = await actions["projects.list"]!({ apiKey: "tok", fetch: fetchFn }) as Record<string, unknown>;
    expect(result.projects).toEqual(projectsFixture.results);
    expect("nextCursor" in result).toBe(false);
  });
});

describe("projects", () => {
  it("projects.list reads the project collection", async () => {
    const { calls, fetchFn } = mock(projectsFixture);
    const result = await actions["projects.list"]!({ apiKey: "tok", fetch: fetchFn }) as Record<string, unknown>;
    expect(new URL(calls[0]!.url).pathname).toBe("/api/v1/projects");
    expect(result.projects).toEqual(projectsFixture.results);
  });

  it("projects.get reads one project by ID", async () => {
    const { calls, fetchFn } = mock(projectFixture);
    const result = await actions["projects.get"]!({ apiKey: "tok", projectId: "6XGgm6PHrGgMpCFX", fetch: fetchFn }) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://api.todoist.com/api/v1/projects/6XGgm6PHrGgMpCFX");
    expect(result.project).toEqual(projectFixture);
  });

  it("projects.get requires the project ID rather than calling the collection", () => {
    expect(() => actions["projects.get"]!({ apiKey: "tok" })).toThrow("projectId is required");
  });

  it("projects.create posts the name and the favourite flag", async () => {
    const { calls, fetchFn } = mock(projectFixture);
    const result = await actions["projects.create"]!({
      apiKey: "tok", name: "Launch", description: "Launch plan", isFavorite: true, fetch: fetchFn,
    }) as Record<string, unknown>;
    expect(calls[0]!.init?.method).toBe("POST");
    expect(sentBody(calls[0]!)).toEqual({ name: "Launch", description: "Launch plan", is_favorite: true });
    expect(result.project).toEqual(projectFixture);
  });

  it("projects.create omits a favourite flag the caller left out", async () => {
    const { calls, fetchFn } = mock(projectFixture);
    await actions["projects.create"]!({ apiKey: "tok", name: "Launch", fetch: fetchFn });
    expect(sentBody(calls[0]!)).toEqual({ name: "Launch" });
  });

  it("projects.update posts to the project path, which is how Todoist updates", async () => {
    const { calls, fetchFn } = mock(projectFixture);
    await actions["projects.update"]!({ apiKey: "tok", projectId: "6XGgm6PHrGgMpCFX", name: "Renamed", fetch: fetchFn });
    expect(calls[0]!.init?.method).toBe("POST");
    expect(calls[0]!.url).toBe("https://api.todoist.com/api/v1/projects/6XGgm6PHrGgMpCFX");
    expect(sentBody(calls[0]!)).toEqual({ name: "Renamed" });
  });

  it("projects.search hits the dedicated search path, not the plain collection", async () => {
    const { calls, fetchFn } = mock(projectsFixture);
    await actions["projects.search"]!({ apiKey: "tok", query: "laun", fetch: fetchFn });
    expect(new URL(calls[0]!.url).pathname).toBe("/api/v1/projects/search");
    expect(new URL(calls[0]!.url).searchParams.get("query")).toBe("laun");
  });

  it("projects.list-archived reads the archived collection", async () => {
    const { calls, fetchFn } = mock(projectsFixture);
    await actions["projects.list-archived"]!({ apiKey: "tok", fetch: fetchFn });
    expect(new URL(calls[0]!.url).pathname).toBe("/api/v1/projects/archived");
  });
});

describe("sections", () => {
  it("sections.list scopes to a project when one is given", async () => {
    const { calls, fetchFn } = mock(sectionsFixture);
    const result = await actions["sections.list"]!({ apiKey: "tok", projectId: "6XGgm6PHrGgMpCFX", fetch: fetchFn }) as Record<string, unknown>;
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/api/v1/sections");
    expect(url.searchParams.get("project_id")).toBe("6XGgm6PHrGgMpCFX");
    expect(result.sections).toEqual(sectionsFixture.results);
  });

  it("sections.get reads one section by ID", async () => {
    const { calls, fetchFn } = mock(sectionFixture);
    const result = await actions["sections.get"]!({ apiKey: "tok", sectionId: "6fFPHV272WWh3gpW", fetch: fetchFn }) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://api.todoist.com/api/v1/sections/6fFPHV272WWh3gpW");
    expect(result.section).toEqual(sectionFixture);
  });

  it("sections.create requires the project the section belongs to", () => {
    expect(() => actions["sections.create"]!({ apiKey: "tok", name: "Groceries" })).toThrow("projectId is required");
  });

  it("sections.create posts the name and project", async () => {
    const { calls, fetchFn } = mock(sectionFixture);
    const result = await actions["sections.create"]!({
      apiKey: "tok", name: "Groceries", projectId: "6XGgm6PHrGgMpCFX", fetch: fetchFn,
    }) as Record<string, unknown>;
    expect(sentBody(calls[0]!)).toEqual({ name: "Groceries", project_id: "6XGgm6PHrGgMpCFX" });
    expect(result.section).toEqual(sectionFixture);
  });
});

describe("tasks", () => {
  it("tasks.list filters by project, section, and label", async () => {
    const { calls, fetchFn } = mock(tasksFixture);
    await actions["tasks.list"]!({
      apiKey: "tok", projectId: "6XGgm6PHrGgMpCFX", sectionId: "6fFPHV272WWh3gpW", label: "priority", fetch: fetchFn,
    });
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/api/v1/tasks");
    expect(url.searchParams.get("project_id")).toBe("6XGgm6PHrGgMpCFX");
    expect(url.searchParams.get("section_id")).toBe("6fFPHV272WWh3gpW");
    expect(url.searchParams.get("label")).toBe("priority");
  });

  it("tasks.get reads one task by ID", async () => {
    const { calls, fetchFn } = mock(taskFixture);
    const result = await actions["tasks.get"]!({ apiKey: "tok", taskId: "6XGgmFVcrG5RRjVr", fetch: fetchFn }) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://api.todoist.com/api/v1/tasks/6XGgmFVcrG5RRjVr");
    expect(result.task).toEqual(taskFixture);
  });

  it("tasks.create requires the content Todoist marks required", () => {
    expect(() => actions["tasks.create"]!({ apiKey: "tok", projectId: "6XGgm6PHrGgMpCFX" })).toThrow("content is required");
  });

  it("tasks.create maps camelCase input onto Todoist's snake_case body", async () => {
    const { calls, fetchFn } = mock(taskFixture);
    const result = await actions["tasks.create"]!({
      apiKey: "tok",
      content: "Buy milk",
      projectId: "6XGgm6PHrGgMpCFX",
      sectionId: "6fFPHV272WWh3gpW",
      dueString: "tomorrow",
      priority: 1,
      labels: ["priority"],
      duration: 30,
      durationUnit: "minute",
      fetch: fetchFn,
    }) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://api.todoist.com/api/v1/tasks");
    expect(sentBody(calls[0]!)).toEqual({
      content: "Buy milk",
      project_id: "6XGgm6PHrGgMpCFX",
      section_id: "6fFPHV272WWh3gpW",
      due_string: "tomorrow",
      priority: 1,
      labels: ["priority"],
      duration: 30,
      duration_unit: "minute",
    });
    expect(result.task).toEqual(taskFixture);
  });

  it("tasks.create sends labels as a real array, not a string", async () => {
    const { calls, fetchFn } = mock(taskFixture);
    await actions["tasks.create"]!({ apiKey: "tok", content: "Buy milk", labels: ["a", "b"], fetch: fetchFn });
    expect((sentBody(calls[0]!) as Record<string, unknown>).labels).toEqual(["a", "b"]);
  });

  it("tasks.create rejects a priority outside Todoist's 1-4 range", () => {
    expect(() => actions["tasks.create"]!({ apiKey: "tok", content: "Buy milk", priority: 9 })).toThrow();
  });

  it("tasks.update posts only the fields the caller supplied", async () => {
    const { calls, fetchFn } = mock(taskFixture);
    await actions["tasks.update"]!({ apiKey: "tok", taskId: "6XGgmFVcrG5RRjVr", content: "Buy oat milk", fetch: fetchFn });
    expect(calls[0]!.init?.method).toBe("POST");
    expect(calls[0]!.url).toBe("https://api.todoist.com/api/v1/tasks/6XGgmFVcrG5RRjVr");
    expect(sentBody(calls[0]!)).toEqual({ content: "Buy oat milk" });
  });

  it("tasks.close and tasks.reopen post to their own subpaths with no body", async () => {
    const { calls, fetchFn } = mock(null, 204);
    await actions["tasks.close"]!({ apiKey: "tok", taskId: "6XGgmFVcrG5RRjVr", fetch: fetchFn });
    await actions["tasks.reopen"]!({ apiKey: "tok", taskId: "6XGgmFVcrG5RRjVr", fetch: fetchFn });
    expect(calls[0]!.url).toBe("https://api.todoist.com/api/v1/tasks/6XGgmFVcrG5RRjVr/close");
    expect(calls[1]!.url).toBe("https://api.todoist.com/api/v1/tasks/6XGgmFVcrG5RRjVr/reopen");
    expect(calls[0]!.init?.method).toBe("POST");
    expect(calls[0]!.init?.body).toBeUndefined();
  });

  it("tasks.close reports the closed task rather than an empty body", async () => {
    const { fetchFn } = mock(null, 204);
    const result = await actions["tasks.close"]!({ apiKey: "tok", taskId: "6XGgmFVcrG5RRjVr", fetch: fetchFn });
    expect(result).toMatchObject({ closed: true, taskId: "6XGgmFVcrG5RRjVr" });
  });

  it("tasks.delete accepts the empty body and echoes the deleted ID", async () => {
    const { calls, fetchFn } = mock(null, 204);
    const result = await actions["tasks.delete"]!({ apiKey: "tok", taskId: "6XGgmFVcrG5RRjVr", fetch: fetchFn });
    expect(calls[0]!.init?.method).toBe("DELETE");
    expect(result).toMatchObject({ deleted: true, taskId: "6XGgmFVcrG5RRjVr" });
  });

  it("tasks.move sends the destination Todoist accepts", async () => {
    const { calls, fetchFn } = mock(taskFixture);
    await actions["tasks.move"]!({ apiKey: "tok", taskId: "6XGgmFVcrG5RRjVr", projectId: "6XGgm6PHrGgMpCFY", fetch: fetchFn });
    expect(calls[0]!.url).toBe("https://api.todoist.com/api/v1/tasks/6XGgmFVcrG5RRjVr/move");
    expect(sentBody(calls[0]!)).toEqual({ project_id: "6XGgm6PHrGgMpCFY" });
  });

  it("tasks.quick-add posts natural language to the quick path", async () => {
    const { calls, fetchFn } = mock(taskFixture);
    const result = await actions["tasks.quick-add"]!({
      apiKey: "tok", text: "Buy milk tomorrow #Errands", autoReminder: true, fetch: fetchFn,
    }) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://api.todoist.com/api/v1/tasks/quick");
    expect(sentBody(calls[0]!)).toEqual({ text: "Buy milk tomorrow #Errands", auto_reminder: true });
    expect(result.task).toEqual(taskFixture);
  });

  it("tasks.filter requires the filter query and sends it verbatim", async () => {
    expect(() => actions["tasks.filter"]!({ apiKey: "tok" })).toThrow("query is required");
    const { calls, fetchFn } = mock(tasksFixture);
    const result = await actions["tasks.filter"]!({ apiKey: "tok", query: "today & @priority", fetch: fetchFn }) as Record<string, unknown>;
    expect(new URL(calls[0]!.url).pathname).toBe("/api/v1/tasks/filter");
    expect(new URL(calls[0]!.url).searchParams.get("query")).toBe("today & @priority");
    expect(result.tasks).toEqual(tasksFixture.results);
  });
});

describe("labels", () => {
  it("labels.list reads the label collection", async () => {
    const { calls, fetchFn } = mock(labelsFixture);
    const result = await actions["labels.list"]!({ apiKey: "tok", fetch: fetchFn }) as Record<string, unknown>;
    expect(new URL(calls[0]!.url).pathname).toBe("/api/v1/labels");
    expect(result.labels).toEqual(labelsFixture.results);
  });

  it("labels.create posts the name and colour", async () => {
    const { calls, fetchFn } = mock(labelFixture);
    const result = await actions["labels.create"]!({ apiKey: "tok", name: "Priority", color: "berry_red", fetch: fetchFn }) as Record<string, unknown>;
    expect(sentBody(calls[0]!)).toEqual({ name: "Priority", color: "berry_red" });
    expect(result.label).toEqual(labelFixture);
  });
});

describe("comments", () => {
  it("comments.list reads a task's comments", async () => {
    const { calls, fetchFn } = mock(commentsFixture);
    const result = await actions["comments.list"]!({ apiKey: "tok", taskId: "6XGgmFVcrG5RRjVr", fetch: fetchFn }) as Record<string, unknown>;
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/api/v1/comments");
    expect(url.searchParams.get("task_id")).toBe("6XGgmFVcrG5RRjVr");
    expect(result.comments).toEqual(commentsFixture.results);
  });

  it("comments.create posts the content against a task", async () => {
    const { calls, fetchFn } = mock(commentFixture);
    const result = await actions["comments.create"]!({
      apiKey: "tok", content: "Looks good to me.", taskId: "6XGgmFVcrG5RRjVr", fetch: fetchFn,
    }) as Record<string, unknown>;
    expect(sentBody(calls[0]!)).toEqual({ content: "Looks good to me.", task_id: "6XGgmFVcrG5RRjVr" });
    expect(result.comment).toEqual(commentFixture);
  });

  it("comments.create requires the content", () => {
    expect(() => actions["comments.create"]!({ apiKey: "tok", taskId: "6XGgmFVcrG5RRjVr" })).toThrow("content is required");
  });
});

describe("error mapping", () => {
  it("surfaces Todoist's top-level error field rather than a generic upstream message", async () => {
    const { fetchFn } = mock(unauthorizedFixture, 401);
    await expect(actions["tasks.get"]!({ apiKey: "bad", taskId: "6XGgmFVcrG5RRjVr", fetch: fetchFn }))
      .rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: "Unauthorized" });
  });

  it("reads the retry-after header as a delay in seconds", async () => {
    const { fetchFn } = mock({ error: "Rate limit exceeded" }, 429, { "retry-after": "4" });
    await expect(actions["tasks.list"]!({ apiKey: "tok", fetch: fetchFn }))
      .rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });

  it("falls back to the declared default when the retry header is absent", async () => {
    const { fetchFn } = mock({ error: "Rate limit exceeded" }, 429);
    await expect(actions["tasks.list"]!({ apiKey: "tok", fetch: fetchFn }))
      .rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: manifest.http.errors.defaultRetryAfterSeconds });
  });

  it("refuses a host outside the manifest's allow list", async () => {
    const offHost = { ...manifest, network: { allowedHosts: ["example.invalid"] } };
    const compiled = compileDeclarativeConnector(offHost as never);
    await expect(compiled.actions["projects.list"]!({ apiKey: "tok", fetch: async () => new Response("{}") }))
      .rejects.toMatchObject({ code: "OUTBOUND_HOST_NOT_ALLOWED" });
  });
});
