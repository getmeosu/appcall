import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import userFixture from "../fixtures/user.json";
import issueFixture from "../fixtures/issue.json";
import issuesFixture from "../fixtures/issues.json";
import noteFixture from "../fixtures/note.json";
import mergeRequestFixture from "../fixtures/merge_request.json";
import mergeRequestsFixture from "../fixtures/merge_requests.json";
import mergeConflictFixture from "../fixtures/merge_conflict.json";
import pipelineFixture from "../fixtures/pipeline.json";
import pipelinesFixture from "../fixtures/pipelines.json";
import projectFixture from "../fixtures/project.json";
import projectsFixture from "../fixtures/projects.json";
import errorUnauthorizedFixture from "../fixtures/error_unauthorized.json";
import errorRateLimitedFixture from "../fixtures/error_rate_limited.json";

const { actions } = compileDeclarativeConnector(manifest as never);

type Call = { url: string; init?: RequestInit };

function mockJson(body: unknown, status = 200, headers: Record<string, string> = {}) {
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

const creds = { host: "gitlab.com", apiToken: "glpat-example-token" };

describe("gitlab connector surface", () => {
  it("compiles one handler per declared operation", () => {
    expect(Object.keys(actions).sort()).toEqual(Object.keys(manifest.operations).sort());
  });
});

describe("authentication", () => {
  it("carries the token as Authorization: Bearer, not the PRIVATE-TOKEN header", async () => {
    const { calls, fetchFn } = mockJson(userFixture);
    await actions.healthcheck!({ ...creds, fetch: fetchFn });
    expect(calls[0]!.init?.headers).toMatchObject({ Authorization: "Bearer glpat-example-token" });
  });

  it("declares apiToken as the secret field http.auth.field points at", () => {
    const secretFields = manifest.auth.setup.fields.filter((f) => (f as { secret?: boolean }).secret);
    expect(secretFields.map((f) => (f as { key: string }).key)).toEqual(["apiToken"]);
    expect(manifest.http.auth.field).toBe("apiToken");
  });

  it("does not issue a live call when no token is supplied — the fixture-safe validated echo instead", () => {
    expect(actions.healthcheck!({})).toEqual({
      connector: "gitlab",
      action: "healthcheck",
      source: "connector",
      status: "ok",
    });
  });

  it("does not issue a live call when host is supplied but apiToken is missing", () => {
    expect(actions.healthcheck!({ host: "gitlab.com" })).toEqual({
      connector: "gitlab",
      action: "healthcheck",
      source: "connector",
      status: "ok",
    });
  });
});

describe("per-tenant host", () => {
  it("builds the base URL from the SaaS host, and the templated allowlist entry alone admits it (no literal \"gitlab.com\" entry needed)", async () => {
    // manifest.network.allowedHosts is just ["{{host}}"] — there is no
    // separate literal "gitlab.com" entry. This proves the SaaS case still
    // passes: the request reaches fetchFn (rather than throwing
    // OUTBOUND_HOST_NOT_ALLOWED) because {{host}} renders to "gitlab.com" for
    // this request and the allowlist check matches against that rendered
    // value, not a hardcoded string.
    expect(manifest.network.allowedHosts).toEqual(["{{host}}"]);
    const { calls, fetchFn } = mockJson(userFixture);
    await actions.healthcheck!({ host: "gitlab.com", apiToken: "t", fetch: fetchFn });
    const url = new URL(calls[0]!.url);
    expect(url.hostname).toBe("gitlab.com");
    expect(url.pathname).toBe("/api/v4/user");
  });

  it("builds the base URL from a self-managed host, admitted because the allowlist entry is templated from that same setup field", async () => {
    const { calls, fetchFn } = mockJson(userFixture);
    await actions.healthcheck!({ host: "gitlab.acme.example", apiToken: "t", fetch: fetchFn });
    const url = new URL(calls[0]!.url);
    expect(url.hostname).toBe("gitlab.acme.example");
    expect(url.protocol).toBe("https:");
  });

  it("rejects a request whose rendered host is outside the manifest's allowed hosts", async () => {
    const offHostManifest = { ...manifest, network: { allowedHosts: ["example.invalid"] } };
    const compiled = compileDeclarativeConnector(offHostManifest as never);
    await expect(
      compiled.actions.healthcheck!({ host: "gitlab.com", apiToken: "t", fetch: async () => new Response("{}") }),
    ).rejects.toMatchObject({ code: "OUTBOUND_HOST_NOT_ALLOWED" });
  });
});

describe("healthcheck", () => {
  it("calls GET /user and reports the authenticated user", async () => {
    const { calls, fetchFn } = mockJson(userFixture);
    const result = await actions.healthcheck!({ ...creds, fetch: fetchFn }) as Record<string, unknown>;
    expect(calls[0]!.init?.method ?? "GET").toBe("GET");
    expect(result).toEqual({
      connector: "gitlab",
      action: "healthcheck",
      source: "provider",
      status: "ok",
      id: 1,
      username: "john_smith",
      name: "John Smith",
      email: "john@example.com",
      webUrl: "http://localhost:3000/john_smith",
    });
  });
});

describe("issues.create", () => {
  it("requires projectId and title", () => {
    expect(() => actions["issues.create"]!({ ...creds, projectId: "4" })).toThrow("title is required");
    expect(() => actions["issues.create"]!({ ...creds, title: "x" })).toThrow("projectId is required");
  });

  it("percent-encodes a namespaced project path, which GitLab requires", async () => {
    const { calls, fetchFn } = mockJson(issueFixture, 201);
    await actions["issues.create"]!({
      ...creds, projectId: "diaspora/diaspora", title: "Issues with auth", fetch: fetchFn,
    });
    expect(calls[0]!.url).toContain("/projects/diaspora%2Fdiaspora/issues");
  });

  it("sends camelCase input translated to GitLab's snake_case body", async () => {
    const { calls, fetchFn } = mockJson(issueFixture, 201);
    await actions["issues.create"]!({
      ...creds, projectId: "4", title: "Issues with auth", dueDate: "2026-09-10", issueType: "task", fetch: fetchFn,
    });
    const body = JSON.parse(String(calls[0]!.init?.body));
    expect(body).toMatchObject({ title: "Issues with auth", due_date: "2026-09-10", issue_type: "task" });
  });

  it("maps the response's id, iid, and web_url", async () => {
    const { fetchFn } = mockJson(issueFixture, 201);
    const result = await actions["issues.create"]!({ ...creds, projectId: "4", title: "x", fetch: fetchFn }) as Record<string, unknown>;
    const issue = result.issue as Record<string, unknown>;
    expect(issue.id).toBe(84);
    expect(issue.iid).toBe(14);
    expect(issue.web_url).toBe("http://gitlab.example.com/my-group/my-project/issues/14");
  });
});

describe("issues.update", () => {
  it("requires projectId and issueIid, not issueId", () => {
    expect(() => actions["issues.update"]!({ ...creds, projectId: "4" })).toThrow("issueIid is required");
  });

  it("PUTs to the iid-scoped path and maps stateEvent to state_event", async () => {
    const { calls, fetchFn } = mockJson(issueFixture);
    await actions["issues.update"]!({ ...creds, projectId: "4", issueIid: 14, stateEvent: "close", fetch: fetchFn });
    expect(calls[0]!.init?.method).toBe("PUT");
    expect(new URL(calls[0]!.url).pathname).toBe("/api/v4/projects/4/issues/14");
    const body = JSON.parse(String(calls[0]!.init?.body));
    expect(body).toEqual({ state_event: "close" });
  });
});

describe("issues.get", () => {
  it("requires issueIid, not issueId", () => {
    expect(() => actions["issues.get"]!({ ...creds, projectId: "4" })).toThrow("issueIid is required");
  });

  it("reads a single issue by the project-scoped iid", async () => {
    const { calls, fetchFn } = mockJson(issueFixture);
    await actions["issues.get"]!({ ...creds, projectId: "4", issueIid: 14, fetch: fetchFn });
    expect(new URL(calls[0]!.url).pathname).toBe("/api/v4/projects/4/issues/14");
  });
});

describe("issues.list", () => {
  it("requires projectId", () => {
    expect(() => actions["issues.list"]!({ ...creds })).toThrow("projectId is required");
  });

  it("paginates with page/per_page and maps the x-next-page response header to nextPage", async () => {
    const { calls, fetchFn } = mockJson(issuesFixture, 200, { "x-next-page": "2" });
    const result = await actions["issues.list"]!({
      ...creds, projectId: "4", page: 1, perPage: 20, state: "opened", fetch: fetchFn,
    }) as Record<string, unknown>;
    const url = new URL(calls[0]!.url);
    expect(url.searchParams.get("page")).toBe("1");
    expect(url.searchParams.get("per_page")).toBe("20");
    expect(url.searchParams.get("state")).toBe("opened");
    expect(result.nextPage).toBe("2");
    expect(result.issues).toEqual(issuesFixture);
  });

  it("returns an empty nextPage once the x-next-page header comes back empty on the last page", async () => {
    const { fetchFn } = mockJson(issuesFixture, 200, { "x-next-page": "" });
    const result = await actions["issues.list"]!({ ...creds, projectId: "4", fetch: fetchFn }) as Record<string, unknown>;
    expect(result.nextPage).toBe("");
  });
});

describe("issues.comment", () => {
  it("requires body", () => {
    expect(() => actions["issues.comment"]!({ ...creds, projectId: "4", issueIid: 14 })).toThrow("body is required");
  });

  it("posts a note and does not fabricate a web_url on it", async () => {
    const { calls, fetchFn } = mockJson(noteFixture, 201);
    const result = await actions["issues.comment"]!({
      ...creds, projectId: "4", issueIid: 14, body: "Text of the comment", fetch: fetchFn,
    }) as Record<string, unknown>;
    expect(new URL(calls[0]!.url).pathname).toBe("/api/v4/projects/4/issues/14/notes");
    const note = result.note as Record<string, unknown>;
    expect(note.id).toBe(302);
    expect(note.web_url).toBeUndefined();
  });
});

describe("mergeRequests.create", () => {
  it("requires sourceBranch, targetBranch, and title", () => {
    expect(() => actions["mergeRequests.create"]!({ ...creds, projectId: "4", targetBranch: "main", title: "x" }))
      .toThrow("sourceBranch is required");
    expect(() => actions["mergeRequests.create"]!({ ...creds, projectId: "4", sourceBranch: "feature", title: "x" }))
      .toThrow("targetBranch is required");
  });

  it("maps sourceBranch/targetBranch to source_branch/target_branch and reads back id, iid, web_url", async () => {
    const { calls, fetchFn } = mockJson(mergeRequestFixture, 201);
    const result = await actions["mergeRequests.create"]!({
      ...creds, projectId: "4", sourceBranch: "feature", targetBranch: "main", title: "Add feature", fetch: fetchFn,
    }) as Record<string, unknown>;
    const body = JSON.parse(String(calls[0]!.init?.body));
    expect(body).toMatchObject({ source_branch: "feature", target_branch: "main", title: "Add feature" });
    const mr = result.mergeRequest as Record<string, unknown>;
    expect(mr.iid).toBe(1);
    expect(mr.web_url).toBe("http://gitlab.example.com/my-group/my-project/-/merge_requests/1");
  });
});

describe("mergeRequests.update", () => {
  it("requires mergeRequestIid, not mergeRequestId", () => {
    expect(() => actions["mergeRequests.update"]!({ ...creds, projectId: "4" })).toThrow("mergeRequestIid is required");
  });

  it("PUTs to the iid-scoped path", async () => {
    const { calls, fetchFn } = mockJson(mergeRequestFixture);
    await actions["mergeRequests.update"]!({ ...creds, projectId: "4", mergeRequestIid: 1, title: "New title", fetch: fetchFn });
    expect(new URL(calls[0]!.url).pathname).toBe("/api/v4/projects/4/merge_requests/1");
  });
});

describe("mergeRequests.get", () => {
  it("reads a single merge request by the project-scoped iid", async () => {
    const { calls, fetchFn } = mockJson(mergeRequestFixture);
    await actions["mergeRequests.get"]!({ ...creds, projectId: "4", mergeRequestIid: 1, fetch: fetchFn });
    expect(new URL(calls[0]!.url).pathname).toBe("/api/v4/projects/4/merge_requests/1");
  });
});

describe("mergeRequests.list", () => {
  it("maps the x-next-page response header to nextPage", async () => {
    const { fetchFn } = mockJson(mergeRequestsFixture, 200, { "x-next-page": "3" });
    const result = await actions["mergeRequests.list"]!({ ...creds, projectId: "4", state: "opened", fetch: fetchFn }) as Record<string, unknown>;
    expect(result.nextPage).toBe("3");
    expect(result.mergeRequests).toEqual(mergeRequestsFixture);
  });
});

describe("mergeRequests.merge", () => {
  it("requires mergeRequestIid, not mergeRequestId", () => {
    expect(() => actions["mergeRequests.merge"]!({ ...creds, projectId: "4" })).toThrow("mergeRequestIid is required");
  });

  it("sends auto_merge, never the deprecated merge_when_pipeline_succeeds", async () => {
    const { calls, fetchFn } = mockJson(mergeRequestFixture);
    await actions["mergeRequests.merge"]!({ ...creds, projectId: "4", mergeRequestIid: 1, autoMerge: true, fetch: fetchFn });
    const body = JSON.parse(String(calls[0]!.init?.body));
    expect(body).toEqual({ auto_merge: true });
  });

  it("maps a stale sha to CONNECTOR_UPSTREAM_ERROR 409 with GitLab's own message", async () => {
    const { fetchFn } = mockJson(mergeConflictFixture, 409);
    const call = actions["mergeRequests.merge"]!({
      ...creds, projectId: "4", mergeRequestIid: 1, sha: "stale-sha", fetch: fetchFn,
    });
    await expect(call).rejects.toMatchObject({
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: "SHA does not match HEAD of source branch",
    });
  });

  it("maps a merge-blocked response to CONNECTOR_UPSTREAM_ERROR 422", async () => {
    const { fetchFn } = mockJson({ message: "Branch cannot be merged" }, 422);
    const call = actions["mergeRequests.merge"]!({ ...creds, projectId: "4", mergeRequestIid: 1, fetch: fetchFn });
    await expect(call).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: "Branch cannot be merged" });
  });
});

describe("pipelines.create", () => {
  it("requires ref", () => {
    expect(() => actions["pipelines.create"]!({ ...creds, projectId: "4" })).toThrow("ref is required");
  });

  it("POSTs to the singular /pipeline path, not the plural /pipelines path", async () => {
    const { calls, fetchFn } = mockJson(pipelineFixture, 201);
    await actions["pipelines.create"]!({ ...creds, projectId: "4", ref: "main", fetch: fetchFn });
    expect(new URL(calls[0]!.url).pathname).toBe("/api/v4/projects/4/pipeline");
  });

  it("reads back the pipeline id and web_url", async () => {
    const { fetchFn } = mockJson(pipelineFixture, 201);
    const result = await actions["pipelines.create"]!({ ...creds, projectId: "4", ref: "main", fetch: fetchFn }) as Record<string, unknown>;
    const pipeline = result.pipeline as Record<string, unknown>;
    expect(pipeline.id).toBe(287);
    expect(pipeline.web_url).toBe("http://127.0.0.1:3000/test-group/test-project/-/pipelines/287");
  });
});

describe("pipelines.get", () => {
  it("GETs the plural /pipelines/:id path, not the singular create path", async () => {
    const { calls, fetchFn } = mockJson(pipelineFixture);
    await actions["pipelines.get"]!({ ...creds, projectId: "4", pipelineId: 287, fetch: fetchFn });
    expect(new URL(calls[0]!.url).pathname).toBe("/api/v4/projects/4/pipelines/287");
  });
});

describe("pipelines.list", () => {
  it("GETs the plural /pipelines path and maps an empty x-next-page header on the last page", async () => {
    const { calls, fetchFn } = mockJson(pipelinesFixture, 200, { "x-next-page": "" });
    const result = await actions["pipelines.list"]!({ ...creds, projectId: "4", fetch: fetchFn }) as Record<string, unknown>;
    expect(new URL(calls[0]!.url).pathname).toBe("/api/v4/projects/4/pipelines");
    expect(result.pipelines).toEqual(pipelinesFixture);
    expect(result.nextPage).toBe("");
  });
});

describe("projects.list", () => {
  it("takes no required input", async () => {
    const { calls, fetchFn } = mockJson(projectsFixture, 200, { "x-next-page": "2" });
    const result = await actions["projects.list"]!({ ...creds, membership: true, simple: true, fetch: fetchFn }) as Record<string, unknown>;
    const url = new URL(calls[0]!.url);
    expect(url.searchParams.get("membership")).toBe("true");
    expect(url.searchParams.get("simple")).toBe("true");
    expect(result.projects).toEqual(projectsFixture);
    expect(result.nextPage).toBe("2");
  });
});

describe("projects.get", () => {
  it("percent-encodes a namespaced project path, which GitLab requires", async () => {
    const { calls, fetchFn } = mockJson(projectFixture);
    const result = await actions["projects.get"]!({
      ...creds, projectId: "diaspora/diaspora", fetch: fetchFn,
    }) as Record<string, unknown>;
    expect(calls[0]!.url).toContain("/projects/diaspora%2Fdiaspora");
    const project = result.project as Record<string, unknown>;
    expect(project.path_with_namespace).toBe("diaspora/diaspora");
  });

  it("accepts a bare numeric id unencoded", async () => {
    const { calls, fetchFn } = mockJson(projectFixture);
    await actions["projects.get"]!({ ...creds, projectId: "4", fetch: fetchFn });
    expect(new URL(calls[0]!.url).pathname).toBe("/api/v4/projects/4");
  });
});

describe("error mapping", () => {
  it("classifies 429 as a rate limit, backing off on the default 60 seconds when no Retry-After header is sent", async () => {
    const { fetchFn } = mockJson(errorRateLimitedFixture, 429);
    await expect(actions.healthcheck!({ ...creds, fetch: fetchFn }))
      .rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 60 });
  });

  it("honors a real Retry-After header when GitLab sends one", async () => {
    const { fetchFn } = mockJson(errorRateLimitedFixture, 429, { "retry-after": "30" });
    await expect(actions.healthcheck!({ ...creds, fetch: fetchFn }))
      .rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 30 });
  });

  it("reads the provider's own message on a 401", async () => {
    const { fetchFn } = mockJson(errorUnauthorizedFixture, 401);
    await expect(actions.healthcheck!({ ...creds, fetch: fetchFn }))
      .rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: "401 Unauthorized" });
  });

  it("falls back to the error field, since OAuth endpoints use that key instead of message", async () => {
    const { fetchFn } = mockJson({ error: "invalid_token" }, 401);
    await expect(actions.healthcheck!({ ...creds, fetch: fetchFn }))
      .rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: "invalid_token" });
  });
});
