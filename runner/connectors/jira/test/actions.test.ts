import { describe, expect, it } from "bun:test";
import {
  createIssue,
  getIssue,
  updateIssue,
  deleteIssue,
  jqlSearch,
  addComment,
  listComments,
  listTransitions,
  doTransition,
  assignIssue,
  getProject,
  getUser,
} from "../src/actions";
import createIssueFixture from "../fixtures/create_issue.json";
import issueGetFixture from "../fixtures/issue_get.json";
import issueCommentAddFixture from "../fixtures/issue_comment_add.json";
import issueCommentsListFixture from "../fixtures/issue_comments_list.json";
import issueTransitionsListFixture from "../fixtures/issue_transitions_list.json";
import projectGetFixture from "../fixtures/project_get.json";
import userGetFixture from "../fixtures/user_get.json";
import jqlSearchFixture from "../fixtures/jql_search.json";

function mockFetch(status: number, body: unknown, extraHeaders: Record<string, string> = {}) {
  return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const headers = new Headers({ "content-type": "application/json", ...extraHeaders });
    return Promise.resolve(new Response(JSON.stringify(body), { status, headers }));
  };
}

function capturingFetch(status: number, body: unknown, captured: { req?: Request }) {
  return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    captured.req = new Request(input, init);
    return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  };
}

// ────────────────────────────────────────────────────────────────────────────
// createIssue (existing — regression tests)
// ────────────────────────────────────────────────────────────────────────────

describe("createIssue action", () => {
  it("validates input without accessToken", () => {
    const result = createIssue({ projectKey: "PROJ", summary: "Test issue", priority: "High" });
    expect(result.connector).toBe("jira");
    expect(result.action).toBe("issues.create");
    expect((result as any).validated.projectKey).toBe("PROJ");
    expect((result as any).validated.summary).toBe("Test issue");
  });

  it("throws when projectKey is missing", () => {
    expect(() => createIssue({ summary: "Test" })).toThrow("projectKey is required");
  });

  it("throws when summary is missing", () => {
    expect(() => createIssue({ projectKey: "PROJ" })).toThrow("summary is required");
  });

  it("creates issue with accessToken and cloudId", async () => {
    const result = await createIssue({
      accessToken: "test-token",
      cloudId: "cloud-123",
      projectKey: "PROJ",
      summary: "New issue from connector",
      priority: "High",
      fetch: mockFetch(201, createIssueFixture),
    });
    expect(result.connector).toBe("jira");
    expect(result.action).toBe("issues.create");
    expect((result as any).issue.key).toBe("PROJ-200");
    expect((result as any).issue.summary).toBe("New issue from connector");
  });

  it("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(createIssue({
      accessToken: "test-token",
      cloudId: "cloud-123",
      projectKey: "PROJ",
      summary: "Test",
      fetch: mockFetch(429, {}, { "retry-after": "60" }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 60 });
  });

  it("maps 400 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(createIssue({
      accessToken: "test-token",
      cloudId: "cloud-123",
      projectKey: "PROJ",
      summary: "Test",
      fetch: mockFetch(400, { errorMessages: ["invalid project"] }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// getIssue
// ────────────────────────────────────────────────────────────────────────────

describe("getIssue action", () => {
  it("validates input without accessToken", () => {
    const result = getIssue({ issueKey: "PROJ-123" });
    expect(result.connector).toBe("jira");
    expect(result.action).toBe("issues.get");
    expect((result as any).validated.issueKey).toBe("PROJ-123");
  });

  it("throws when issueKey is missing", () => {
    expect(() => getIssue({})).toThrow("issueKey is required");
  });

  it("fetches issue by key with correct URL and Authorization header", async () => {
    const captured: { req?: Request } = {};
    const result = await getIssue({
      accessToken: "bearer-token",
      cloudId: "cid-abc",
      issueKey: "PROJ-123",
      fetch: capturingFetch(200, issueGetFixture, captured),
    });
    expect(result.connector).toBe("jira");
    expect(result.action).toBe("issues.get");
    expect((result as any).issue.key).toBe("PROJ-123");
    expect((result as any).issue.summary).toBe("Fix login bug");
    expect((result as any).issue.provider).toBe("jira");
    expect(captured.req!.url).toContain("/ex/jira/cid-abc/rest/api/3/issue/PROJ-123");
    expect(captured.req!.method).toBe("GET");
    expect(captured.req!.headers.get("Authorization")).toBe("Bearer bearer-token");
  });

  it("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(getIssue({
      accessToken: "tok",
      cloudId: "cid",
      issueKey: "PROJ-999",
      fetch: mockFetch(404, { errorMessages: ["Issue does not exist"] }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  it("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(getIssue({
      accessToken: "tok",
      cloudId: "cid",
      issueKey: "PROJ-123",
      fetch: mockFetch(429, {}, { "retry-after": "30" }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 30 });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// updateIssue
// ────────────────────────────────────────────────────────────────────────────

describe("updateIssue action", () => {
  it("validates input without accessToken", () => {
    const result = updateIssue({ issueKey: "PROJ-123", summary: "New summary" });
    expect(result.connector).toBe("jira");
    expect(result.action).toBe("issues.update");
    expect((result as any).validated.issueKey).toBe("PROJ-123");
    expect((result as any).validated.summary).toBe("New summary");
  });

  it("throws when issueKey is missing", () => {
    expect(() => updateIssue({ summary: "test" })).toThrow("issueKey is required");
  });

  it("sends PUT request with fields and Authorization header", async () => {
    const captured: { req?: Request } = {};
    const result = await updateIssue({
      accessToken: "tok",
      cloudId: "cid",
      issueKey: "PROJ-123",
      summary: "Updated title",
      priority: "High",
      labels: ["updated"],
      fetch: capturingFetch(204, null, captured),
    });
    expect(result.connector).toBe("jira");
    expect(result.action).toBe("issues.update");
    expect((result as any).updated).toBe(true);
    expect(captured.req!.method).toBe("PUT");
    expect(captured.req!.url).toContain("/issue/PROJ-123");
    expect(captured.req!.headers.get("Authorization")).toBe("Bearer tok");
    const body = await captured.req!.json();
    expect(body.fields.summary).toBe("Updated title");
    expect(body.fields.priority.name).toBe("High");
    expect(body.fields.labels).toEqual(["updated"]);
  });

  it("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(updateIssue({
      accessToken: "tok",
      cloudId: "cid",
      issueKey: "PROJ-999",
      summary: "title",
      fetch: mockFetch(404, { errorMessages: ["Not found"] }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  it("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(updateIssue({
      accessToken: "tok",
      cloudId: "cid",
      issueKey: "PROJ-1",
      summary: "title",
      fetch: mockFetch(429, {}, { "retry-after": "15" }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 15 });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// deleteIssue
// ────────────────────────────────────────────────────────────────────────────

describe("deleteIssue action", () => {
  it("validates input without accessToken", () => {
    const result = deleteIssue({ issueKey: "PROJ-123" });
    expect(result.connector).toBe("jira");
    expect(result.action).toBe("issues.delete");
    expect((result as any).validated.issueKey).toBe("PROJ-123");
  });

  it("throws when issueKey is missing", () => {
    expect(() => deleteIssue({})).toThrow("issueKey is required");
  });

  it("sends DELETE request with correct URL and Authorization", async () => {
    const captured: { req?: Request } = {};
    const result = await deleteIssue({
      accessToken: "tok",
      cloudId: "cid",
      issueKey: "PROJ-123",
      fetch: capturingFetch(204, null, captured),
    });
    expect(result.connector).toBe("jira");
    expect(result.action).toBe("issues.delete");
    expect((result as any).deleted).toBe(true);
    expect(captured.req!.method).toBe("DELETE");
    expect(captured.req!.url).toContain("/issue/PROJ-123");
    expect(captured.req!.headers.get("Authorization")).toBe("Bearer tok");
  });

  it("includes deleteSubtasks=true in query string when requested", async () => {
    const captured: { req?: Request } = {};
    await deleteIssue({
      accessToken: "tok",
      cloudId: "cid",
      issueKey: "PROJ-123",
      deleteSubtasks: true,
      fetch: capturingFetch(204, null, captured),
    });
    expect(captured.req!.url).toContain("deleteSubtasks=true");
  });

  it("maps 403 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(deleteIssue({
      accessToken: "tok",
      cloudId: "cid",
      issueKey: "PROJ-123",
      fetch: mockFetch(403, { errorMessages: ["Forbidden"] }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// jqlSearch
// ────────────────────────────────────────────────────────────────────────────

describe("jqlSearch action", () => {
  it("validates input without accessToken", () => {
    const result = jqlSearch({ jql: "project = PROJ" });
    expect(result.connector).toBe("jira");
    expect(result.action).toBe("issues.jql_search");
    expect((result as any).validated.jql).toBe("project = PROJ");
  });

  it("throws when jql is missing", () => {
    expect(() => jqlSearch({})).toThrow("jql is required");
  });

  it("POSTs to /search with JQL body and returns normalized issues", async () => {
    const captured: { req?: Request } = {};
    const result = await jqlSearch({
      accessToken: "tok",
      cloudId: "cid",
      jql: "project = PROJ AND status = 'To Do'",
      maxResults: 10,
      startAt: 0,
      fetch: capturingFetch(200, jqlSearchFixture, captured),
    });
    expect(result.connector).toBe("jira");
    expect(result.action).toBe("issues.jql_search");
    expect(Array.isArray((result as any).issues)).toBe(true);
    expect((result as any).issues.length).toBeGreaterThan(0);
    expect((result as any).issues[0].provider).toBe("jira");
    expect((result as any).total).toBe(1);
    expect(captured.req!.method).toBe("POST");
    expect(captured.req!.url).toContain("/search");
    expect(captured.req!.headers.get("Authorization")).toBe("Bearer tok");
    const body = await captured.req!.json();
    expect(body.jql).toBe("project = PROJ AND status = 'To Do'");
    expect(body.maxResults).toBe(10);
  });

  it("maps 400 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(jqlSearch({
      accessToken: "tok",
      cloudId: "cid",
      jql: "INVALID JQL !!$$$",
      fetch: mockFetch(400, { errorMessages: ["The query is not parseable"] }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  it("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(jqlSearch({
      accessToken: "tok",
      cloudId: "cid",
      jql: "project = PROJ",
      fetch: mockFetch(429, {}, { "retry-after": "20" }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 20 });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// addComment
// ────────────────────────────────────────────────────────────────────────────

describe("addComment action", () => {
  it("validates input without accessToken", () => {
    const result = addComment({ issueKey: "PROJ-123", body: "Hello!" });
    expect(result.connector).toBe("jira");
    expect(result.action).toBe("issues.comments.add");
    expect((result as any).validated.issueKey).toBe("PROJ-123");
    expect((result as any).validated.body).toBe("Hello!");
  });

  it("throws when issueKey is missing", () => {
    expect(() => addComment({ body: "text" })).toThrow("issueKey is required");
  });

  it("throws when body is missing", () => {
    expect(() => addComment({ issueKey: "PROJ-1" })).toThrow("body is required");
  });

  it("POSTs ADF comment and returns normalized comment", async () => {
    const captured: { req?: Request } = {};
    const result = await addComment({
      accessToken: "tok",
      cloudId: "cid",
      issueKey: "PROJ-123",
      body: "This is a test comment added via connector.",
      fetch: capturingFetch(201, issueCommentAddFixture, captured),
    });
    expect(result.connector).toBe("jira");
    expect(result.action).toBe("issues.comments.add");
    expect((result as any).comment.providerCommentId).toBe("30001");
    expect((result as any).comment.authorName).toBe("Alice Dev");
    expect((result as any).comment.body).toContain("test comment");
    expect(captured.req!.method).toBe("POST");
    expect(captured.req!.url).toContain("/issue/PROJ-123/comment");
    expect(captured.req!.headers.get("Authorization")).toBe("Bearer tok");
    const body = await captured.req!.json();
    expect(body.body.type).toBe("doc");
    expect(body.body.content[0].type).toBe("paragraph");
  });

  it("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(addComment({
      accessToken: "tok",
      cloudId: "cid",
      issueKey: "PROJ-999",
      body: "comment",
      fetch: mockFetch(404, { errorMessages: ["Issue not found"] }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  it("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(addComment({
      accessToken: "tok",
      cloudId: "cid",
      issueKey: "PROJ-1",
      body: "comment",
      fetch: mockFetch(429, {}, { "retry-after": "5" }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 5 });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// listComments
// ────────────────────────────────────────────────────────────────────────────

describe("listComments action", () => {
  it("validates input without accessToken", () => {
    const result = listComments({ issueKey: "PROJ-123" });
    expect(result.connector).toBe("jira");
    expect(result.action).toBe("issues.comments.list");
    expect((result as any).validated.issueKey).toBe("PROJ-123");
  });

  it("throws when issueKey is missing", () => {
    expect(() => listComments({})).toThrow("issueKey is required");
  });

  it("GETs comments list and returns normalized comments", async () => {
    const captured: { req?: Request } = {};
    const result = await listComments({
      accessToken: "tok",
      cloudId: "cid",
      issueKey: "PROJ-123",
      fetch: capturingFetch(200, issueCommentsListFixture, captured),
    });
    expect(result.connector).toBe("jira");
    expect(result.action).toBe("issues.comments.list");
    expect(Array.isArray((result as any).comments)).toBe(true);
    expect((result as any).comments.length).toBe(2);
    expect((result as any).total).toBe(2);
    expect((result as any).comments[0].providerCommentId).toBe("30001");
    expect((result as any).comments[1].authorName).toBe("Bob Jones");
    expect(captured.req!.method).toBe("GET");
    expect(captured.req!.url).toContain("/issue/PROJ-123/comment");
    expect(captured.req!.headers.get("Authorization")).toBe("Bearer tok");
  });

  it("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(listComments({
      accessToken: "tok",
      cloudId: "cid",
      issueKey: "PROJ-1",
      fetch: mockFetch(429, {}, { "retry-after": "10" }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 10 });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// listTransitions
// ────────────────────────────────────────────────────────────────────────────

describe("listTransitions action", () => {
  it("validates input without accessToken", () => {
    const result = listTransitions({ issueKey: "PROJ-123" });
    expect(result.connector).toBe("jira");
    expect(result.action).toBe("issues.transitions.list");
    expect((result as any).validated.issueKey).toBe("PROJ-123");
  });

  it("throws when issueKey is missing", () => {
    expect(() => listTransitions({})).toThrow("issueKey is required");
  });

  it("GETs transitions and returns normalized list", async () => {
    const captured: { req?: Request } = {};
    const result = await listTransitions({
      accessToken: "tok",
      cloudId: "cid",
      issueKey: "PROJ-123",
      fetch: capturingFetch(200, issueTransitionsListFixture, captured),
    });
    expect(result.connector).toBe("jira");
    expect(result.action).toBe("issues.transitions.list");
    expect(Array.isArray((result as any).transitions)).toBe(true);
    expect((result as any).transitions.length).toBe(3);
    expect((result as any).transitions[0].id).toBe("11");
    expect((result as any).transitions[0].name).toBe("To Do");
    expect((result as any).transitions[2].name).toBe("Done");
    expect(captured.req!.method).toBe("GET");
    expect(captured.req!.url).toContain("/issue/PROJ-123/transitions");
    expect(captured.req!.headers.get("Authorization")).toBe("Bearer tok");
  });

  it("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(listTransitions({
      accessToken: "tok",
      cloudId: "cid",
      issueKey: "PROJ-1",
      fetch: mockFetch(429, {}, { "retry-after": "25" }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 25 });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// doTransition
// ────────────────────────────────────────────────────────────────────────────

describe("doTransition action", () => {
  it("validates input without accessToken", () => {
    const result = doTransition({ issueKey: "PROJ-123", transitionId: "21" });
    expect(result.connector).toBe("jira");
    expect(result.action).toBe("issues.transitions.do");
    expect((result as any).validated.issueKey).toBe("PROJ-123");
    expect((result as any).validated.transitionId).toBe("21");
  });

  it("throws when issueKey is missing", () => {
    expect(() => doTransition({ transitionId: "21" })).toThrow("issueKey is required");
  });

  it("throws when transitionId is missing", () => {
    expect(() => doTransition({ issueKey: "PROJ-1" })).toThrow("transitionId is required");
  });

  it("POSTs transition with correct body and Authorization header", async () => {
    const captured: { req?: Request } = {};
    const result = await doTransition({
      accessToken: "tok",
      cloudId: "cid",
      issueKey: "PROJ-123",
      transitionId: "31",
      fetch: capturingFetch(204, null, captured),
    });
    expect(result.connector).toBe("jira");
    expect(result.action).toBe("issues.transitions.do");
    expect((result as any).transitioned).toBe(true);
    expect(captured.req!.method).toBe("POST");
    expect(captured.req!.url).toContain("/issue/PROJ-123/transitions");
    expect(captured.req!.headers.get("Authorization")).toBe("Bearer tok");
    const body = await captured.req!.json();
    expect(body.transition.id).toBe("31");
  });

  it("includes comment in body when provided", async () => {
    const captured: { req?: Request } = {};
    await doTransition({
      accessToken: "tok",
      cloudId: "cid",
      issueKey: "PROJ-123",
      transitionId: "21",
      comment: "Moving to In Progress",
      fetch: capturingFetch(204, null, captured),
    });
    const body = await captured.req!.json();
    expect(body.update.comment[0].add.body.type).toBe("doc");
    expect(body.update.comment[0].add.body.content[0].content[0].text).toBe("Moving to In Progress");
  });

  it("maps 400 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(doTransition({
      accessToken: "tok",
      cloudId: "cid",
      issueKey: "PROJ-1",
      transitionId: "99",
      fetch: mockFetch(400, { errorMessages: ["Transition is not valid"] }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// assignIssue
// ────────────────────────────────────────────────────────────────────────────

describe("assignIssue action", () => {
  it("validates input without accessToken", () => {
    const result = assignIssue({ issueKey: "PROJ-123", accountId: "uuid-user-1" });
    expect(result.connector).toBe("jira");
    expect(result.action).toBe("issues.assign");
    expect((result as any).validated.issueKey).toBe("PROJ-123");
    expect((result as any).validated.accountId).toBe("uuid-user-1");
  });

  it("throws when issueKey is missing", () => {
    expect(() => assignIssue({ accountId: "uid" })).toThrow("issueKey is required");
  });

  it("PUTs assignee with accountId and returns assigned:true", async () => {
    const captured: { req?: Request } = {};
    const result = await assignIssue({
      accessToken: "tok",
      cloudId: "cid",
      issueKey: "PROJ-123",
      accountId: "uuid-user-1",
      fetch: capturingFetch(204, null, captured),
    });
    expect(result.connector).toBe("jira");
    expect(result.action).toBe("issues.assign");
    expect((result as any).assigned).toBe(true);
    expect(captured.req!.method).toBe("PUT");
    expect(captured.req!.url).toContain("/issue/PROJ-123/assignee");
    expect(captured.req!.headers.get("Authorization")).toBe("Bearer tok");
    const body = await captured.req!.json();
    expect(body.accountId).toBe("uuid-user-1");
  });

  it("sends null accountId to unassign", async () => {
    const captured: { req?: Request } = {};
    await assignIssue({
      accessToken: "tok",
      cloudId: "cid",
      issueKey: "PROJ-123",
      fetch: capturingFetch(204, null, captured),
    });
    const body = await captured.req!.json();
    expect(body.accountId).toBeNull();
  });

  it("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(assignIssue({
      accessToken: "tok",
      cloudId: "cid",
      issueKey: "PROJ-999",
      fetch: mockFetch(404, { errorMessages: ["Not found"] }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  it("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(assignIssue({
      accessToken: "tok",
      cloudId: "cid",
      issueKey: "PROJ-1",
      fetch: mockFetch(429, {}, { "retry-after": "40" }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 40 });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// getProject
// ────────────────────────────────────────────────────────────────────────────

describe("getProject action", () => {
  it("validates input without accessToken", () => {
    const result = getProject({ projectKey: "PROJ" });
    expect(result.connector).toBe("jira");
    expect(result.action).toBe("projects.get");
    expect((result as any).validated.projectKey).toBe("PROJ");
  });

  it("throws when projectKey is missing", () => {
    expect(() => getProject({})).toThrow("projectKey is required");
  });

  it("GETs project with correct URL and Authorization header", async () => {
    const captured: { req?: Request } = {};
    const result = await getProject({
      accessToken: "tok",
      cloudId: "cid",
      projectKey: "PROJ",
      fetch: capturingFetch(200, projectGetFixture, captured),
    });
    expect(result.connector).toBe("jira");
    expect(result.action).toBe("projects.get");
    expect((result as any).project.key).toBe("PROJ");
    expect((result as any).project.name).toBe("Main Project");
    expect((result as any).project.provider).toBe("jira");
    expect(captured.req!.method).toBe("GET");
    expect(captured.req!.url).toContain("/project/PROJ");
    expect(captured.req!.headers.get("Authorization")).toBe("Bearer tok");
  });

  it("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(getProject({
      accessToken: "tok",
      cloudId: "cid",
      projectKey: "NOTEXIST",
      fetch: mockFetch(404, { errorMessages: ["Project does not exist"] }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  it("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(getProject({
      accessToken: "tok",
      cloudId: "cid",
      projectKey: "PROJ",
      fetch: mockFetch(429, {}, { "retry-after": "12" }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 12 });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// getUser
// ────────────────────────────────────────────────────────────────────────────

describe("getUser action", () => {
  it("validates input without accessToken", () => {
    const result = getUser({ accountId: "uuid-user-1" });
    expect(result.connector).toBe("jira");
    expect(result.action).toBe("users.get");
    expect((result as any).validated.accountId).toBe("uuid-user-1");
  });

  it("throws when accountId is missing", () => {
    expect(() => getUser({})).toThrow("accountId is required");
  });

  it("GETs user with accountId query param and Authorization header", async () => {
    const captured: { req?: Request } = {};
    const result = await getUser({
      accessToken: "tok",
      cloudId: "cid",
      accountId: "uuid-user-1",
      fetch: capturingFetch(200, userGetFixture, captured),
    });
    expect(result.connector).toBe("jira");
    expect(result.action).toBe("users.get");
    expect((result as any).user.accountId).toBe("uuid-user-1");
    expect((result as any).user.displayName).toBe("Alice Dev");
    expect((result as any).user.emailAddress).toBe("alice@example.com");
    expect((result as any).user.provider).toBe("jira");
    expect(captured.req!.method).toBe("GET");
    expect(captured.req!.url).toContain("/user");
    expect(captured.req!.url).toContain("accountId=uuid-user-1");
    expect(captured.req!.headers.get("Authorization")).toBe("Bearer tok");
  });

  it("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(getUser({
      accessToken: "tok",
      cloudId: "cid",
      accountId: "no-such-user",
      fetch: mockFetch(404, { errorMessages: ["User not found"] }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  it("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(getUser({
      accessToken: "tok",
      cloudId: "cid",
      accountId: "uuid-user-1",
      fetch: mockFetch(429, {}, { "retry-after": "8" }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 8 });
  });
});
