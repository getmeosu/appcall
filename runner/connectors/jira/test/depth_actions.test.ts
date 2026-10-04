import { describe, expect, it } from "bun:test";
import {
  getIssueChangelog,
  addWatcher,
  createIssueLink,
  addWorklog,
  getMyself,
  listFields,
} from "../src/actions";
import issueChangelogFixture from "../fixtures/issue_changelog.json";
import createIssueLinkFixture from "../fixtures/create_issue_link.json";
import addWorklogFixture from "../fixtures/add_worklog.json";
import userGetFixture from "../fixtures/user_get.json";
import fieldsListFixture from "../fixtures/fields_list.json";

function mockFetch(status: number, body: unknown, extraHeaders: Record<string, string> = {}) {
  return (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    const headers = new Headers({ "content-type": "application/json", ...extraHeaders });
    return Promise.resolve(new Response(status === 204 ? null : JSON.stringify(body), { status, headers }));
  };
}

function capturingFetch(status: number, body: unknown, captured: { req?: Request }) {
  return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    captured.req = new Request(input, init);
    return Promise.resolve(
      new Response(status === 204 ? null : JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );
  };
}

describe("getIssueChangelog action", () => {
  it("validates input without accessToken", () => {
    const result = getIssueChangelog({ issueKey: "PROJ-123" });
    expect(result.connector).toBe("jira");
    expect(result.action).toBe("issues.changelog.get");
    expect((result as any).validated.issueKey).toBe("PROJ-123");
  });

  it("throws when issueKey is missing", () => {
    expect(() => getIssueChangelog({})).toThrow("issueKey is required");
  });

  it("GETs changelog with correct URL and Authorization", async () => {
    const captured: { req?: Request } = {};
    const result = await getIssueChangelog({
      accessToken: "tok",
      cloudId: "cid",
      issueKey: "PROJ-123",
      startAt: 0,
      maxResults: 50,
      fetch: capturingFetch(200, issueChangelogFixture, captured),
    });
    expect(result.action).toBe("issues.changelog.get");
    expect((result as any).values).toHaveLength(2);
    expect((result as any).values[0].id).toBe("10000");
    expect((result as any).total).toBe(2);
    expect(captured.req!.method).toBe("GET");
    expect(captured.req!.url).toContain("/issue/PROJ-123/changelog");
    expect(captured.req!.url).toContain("startAt=0");
    expect(captured.req!.url).toContain("maxResults=50");
    expect(captured.req!.headers.get("Authorization")).toBe("Bearer tok");
  });

  it("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(getIssueChangelog({
      accessToken: "tok",
      cloudId: "cid",
      issueKey: "PROJ-999",
      fetch: mockFetch(404, { errorMessages: ["Not found"] }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

describe("addWatcher action", () => {
  it("validates input without accessToken", () => {
    const result = addWatcher({ issueKey: "PROJ-123", accountId: "uuid-user-1" });
    expect(result.action).toBe("issues.watchers.add");
    expect((result as any).validated.accountId).toBe("uuid-user-1");
  });

  it("throws when issueKey or accountId is missing", () => {
    expect(() => addWatcher({ accountId: "uid" })).toThrow("issueKey is required");
    expect(() => addWatcher({ issueKey: "PROJ-1" })).toThrow("accountId is required");
  });

  it("POSTs watcher accountId as a JSON string", async () => {
    const captured: { req?: Request } = {};
    const result = await addWatcher({
      accessToken: "tok",
      cloudId: "cid",
      issueKey: "PROJ-123",
      accountId: "uuid-user-1",
      fetch: capturingFetch(204, null, captured),
    });
    expect(result.action).toBe("issues.watchers.add");
    expect((result as any).added).toBe(true);
    expect(captured.req!.method).toBe("POST");
    expect(captured.req!.url).toContain("/issue/PROJ-123/watchers");
    expect(captured.req!.headers.get("Authorization")).toBe("Bearer tok");
    expect(await captured.req!.json()).toBe("uuid-user-1");
  });

  it("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(addWatcher({
      accessToken: "tok",
      cloudId: "cid",
      issueKey: "PROJ-123",
      accountId: "uuid-user-1",
      fetch: mockFetch(429, {}, { "retry-after": "20" }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 20 });
  });
});

describe("createIssueLink action", () => {
  it("validates input without accessToken", () => {
    const result = createIssueLink({
      inwardIssueKey: "PROJ-123",
      outwardIssueKey: "PROJ-124",
      type: "Blocks",
    });
    expect(result.action).toBe("issues.links.create");
    expect((result as any).validated.type).toBe("Blocks");
  });

  it("throws when required fields are missing", () => {
    expect(() => createIssueLink({ outwardIssueKey: "PROJ-2", type: "Blocks" })).toThrow("inwardIssueKey is required");
  });

  it("POSTs an issue link", async () => {
    const captured: { req?: Request } = {};
    const result = await createIssueLink({
      accessToken: "tok",
      cloudId: "cid",
      inwardIssueKey: "PROJ-123",
      outwardIssueKey: "PROJ-124",
      type: "Blocks",
      comment: "Depends on the login fix.",
      fetch: capturingFetch(201, createIssueLinkFixture, captured),
    });
    expect(result.action).toBe("issues.links.create");
    expect((result as any).created).toBe(true);
    expect(captured.req!.method).toBe("POST");
    expect(captured.req!.url).toContain("/issueLink");
    const body = await captured.req!.json();
    expect(body.type.name).toBe("Blocks");
    expect(body.inwardIssue.key).toBe("PROJ-123");
    expect(body.outwardIssue.key).toBe("PROJ-124");
    expect(body.comment.body.content[0].content[0].text).toBe("Depends on the login fix.");
  });
});

describe("addWorklog action", () => {
  it("validates input without accessToken", () => {
    const result = addWorklog({ issueKey: "PROJ-123", timeSpent: "1h 30m" });
    expect(result.action).toBe("worklogs.add");
    expect((result as any).validated.timeSpent).toBe("1h 30m");
  });

  it("throws when issueKey or timeSpent is missing", () => {
    expect(() => addWorklog({ timeSpent: "1h" })).toThrow("issueKey is required");
    expect(() => addWorklog({ issueKey: "PROJ-1" })).toThrow("timeSpent is required");
  });

  it("POSTs a worklog", async () => {
    const captured: { req?: Request } = {};
    const result = await addWorklog({
      accessToken: "tok",
      cloudId: "cid",
      issueKey: "PROJ-123",
      timeSpent: "1h 30m",
      started: "2025-06-01T09:00:00.000+0000",
      comment: "Investigated login failure.",
      fetch: capturingFetch(201, addWorklogFixture, captured),
    });
    expect(result.action).toBe("worklogs.add");
    expect((result as any).worklog.id).toBe("jira-worklog:10050");
    expect((result as any).worklog.timeSpent).toBe("1h 30m");
    expect((result as any).worklog.timeSpentSeconds).toBe(5400);
    expect(captured.req!.method).toBe("POST");
    expect(captured.req!.url).toContain("/issue/PROJ-123/worklog");
    const body = await captured.req!.json();
    expect(body.timeSpent).toBe("1h 30m");
    expect(body.started).toBe("2025-06-01T09:00:00.000+0000");
    expect(body.comment.content[0].content[0].text).toBe("Investigated login failure.");
  });
});

describe("getMyself action", () => {
  it("validates input without accessToken", () => {
    const result = getMyself({});
    expect(result.action).toBe("myself.get");
  });

  it("GETs the current user", async () => {
    const captured: { req?: Request } = {};
    const result = await getMyself({
      accessToken: "tok",
      cloudId: "cid",
      fetch: capturingFetch(200, userGetFixture, captured),
    });
    expect(result.action).toBe("myself.get");
    expect((result as any).user.accountId).toBe("uuid-user-1");
    expect((result as any).user.displayName).toBe("Alice Dev");
    expect(captured.req!.method).toBe("GET");
    expect(captured.req!.url).toContain("/myself");
    expect(captured.req!.headers.get("Authorization")).toBe("Bearer tok");
  });

  it("maps 401 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(getMyself({
      accessToken: "tok",
      cloudId: "cid",
      fetch: mockFetch(401, { errorMessages: ["unauthorized"] }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

describe("listFields action", () => {
  it("validates input without accessToken", () => {
    const result = listFields({});
    expect(result.action).toBe("fields.list");
  });

  it("GETs the field catalog", async () => {
    const captured: { req?: Request } = {};
    const result = await listFields({
      accessToken: "tok",
      cloudId: "cid",
      fetch: capturingFetch(200, fieldsListFixture, captured),
    });
    expect(result.action).toBe("fields.list");
    expect((result as any).fields).toHaveLength(2);
    expect((result as any).fields[0].id).toBe("summary");
    expect((result as any).fields[1].custom).toBe(true);
    expect(captured.req!.method).toBe("GET");
    expect(captured.req!.url).toContain("/field");
    expect(captured.req!.headers.get("Authorization")).toBe("Bearer tok");
  });

  it("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(listFields({
      accessToken: "tok",
      cloudId: "cid",
      fetch: mockFetch(429, {}, { "retry-after": "9" }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 9 });
  });
});
