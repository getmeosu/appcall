import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import viewerFixture from "../fixtures/viewer.json";
import issueCreateFixture from "../fixtures/issue_create.json";
import issueUpdateFixture from "../fixtures/issue_update.json";
import issueFixture from "../fixtures/issue.json";
import issuesFixture from "../fixtures/issues.json";
import commentCreateFixture from "../fixtures/comment_create.json";
import teamsFixture from "../fixtures/teams.json";
import workflowStatesFixture from "../fixtures/workflow_states.json";
import projectsFixture from "../fixtures/projects.json";
import projectFixture from "../fixtures/project.json";
import usersFixture from "../fixtures/users.json";
import organizationFixture from "../fixtures/organization.json";
import errorGraphqlFixture from "../fixtures/error_graphql.json";
import errorRateLimitedFixture from "../fixtures/error_rate_limited.json";

const { actions } = compileDeclarativeConnector(manifest as never);

type Call = { url: string; init?: RequestInit };

function mockJson(body: unknown, status = 200, headers: Record<string, string> = {}) {
  const calls: Call[] = [];
  const fetchFn = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...headers },
    });
  };
  return { calls, fetchFn };
}

function bodyOf(call: Call): Record<string, unknown> {
  return JSON.parse(String(call.init?.body ?? "{}"));
}

describe("linear connector surface", () => {
  it("compiles one handler per declared operation", () => {
    expect(Object.keys(actions).sort()).toEqual(Object.keys(manifest.operations).sort());
  });
});

describe("authentication", () => {
  it("sends the bare API key as Authorization, with no Bearer prefix", async () => {
    const { calls, fetchFn } = mockJson(viewerFixture);
    await actions.healthcheck!({ apiKey: "lin_api_abc123", fetch: fetchFn });
    const headers = new Headers(calls[0]!.init?.headers as HeadersInit);
    expect(headers.get("Authorization")).toBe("lin_api_abc123");
  });

  it("declares apiKey as the only secret setup field, matching http.auth.field", () => {
    const secretFields = manifest.auth.setup.fields.filter((field) => field.secret);
    expect(secretFields.map((field) => field.key)).toEqual(["apiKey"]);
    expect(manifest.http.auth.field).toBe("apiKey");
  });

  it("does not issue a live call when no key is supplied — the fixture-safe validated echo instead", () => {
    expect(actions.healthcheck!({})).toEqual({
      connector: "linear",
      action: "healthcheck",
      source: "connector",
      status: "ok",
    });
  });
});

describe("healthcheck", () => {
  it("posts query Me to /graphql and reports the authenticated viewer's id, name, and email", async () => {
    const { calls, fetchFn } = mockJson(viewerFixture);
    const result = await actions.healthcheck!({ apiKey: "k", fetch: fetchFn }) as Record<string, unknown>;
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/graphql");
    expect(calls[0]!.init?.method).toBe("POST");
    expect(bodyOf(calls[0]!).query).toContain("viewer");
    expect(result).toEqual({
      connector: "linear",
      action: "healthcheck",
      source: "provider",
      status: "ok",
      viewerId: "a1b2c3d4-0001-4a11-8b11-000000000001",
      name: "Jamie Rivera",
      email: "jamie@example.com",
    });
  });

  it("treats a 200 with a null viewer as unauthenticated, since Linear can answer 200 on auth failure", async () => {
    const { fetchFn } = mockJson({ data: { viewer: null } });
    const result = await actions.healthcheck!({ apiKey: "bad-key", fetch: fetchFn }) as Record<string, unknown>;
    expect(result.viewerId).toBeUndefined();
  });
});

describe("issues.create", () => {
  it("requires teamId and title", () => {
    expect(() => actions["issues.create"]!({ apiKey: "k", title: "x" })).toThrow("teamId is required");
    expect(() => actions["issues.create"]!({ apiKey: "k", teamId: "t1" })).toThrow("title is required");
  });

  it("is classified as a GraphQL mutation, so it requires confirmation", () => {
    expect(manifest.operations["issues.create"]!.sideEffect).toBe("write");
  });

  it("sends the issueCreate mutation with the input nested under variables.input", async () => {
    const { calls, fetchFn } = mockJson(issueCreateFixture);
    const result = await actions["issues.create"]!({
      apiKey: "k",
      teamId: "team-uuid",
      title: "Fix the login redirect loop",
      priority: 2,
      labelIds: ["label-1"],
      fetch: fetchFn,
    }) as Record<string, unknown>;

    const sent = bodyOf(calls[0]!);
    expect(String(sent.query)).toContain("mutation IssueCreate");
    expect(String(sent.query)).toContain("issueCreate(input: $input)");
    const variables = sent.variables as Record<string, unknown>;
    const input = variables.input as Record<string, unknown>;
    expect(input.teamId).toBe("team-uuid");
    expect(input.title).toBe("Fix the login redirect loop");
    expect(input.priority).toBe(2);
    expect(input.labelIds).toEqual(["label-1"]);
    expect(input.description).toBeUndefined();

    expect(result.success).toBe(true);
    const issue = result.issue as Record<string, unknown>;
    expect(issue.id).toBe("a1b2c3d4-0002-4a11-8b11-000000000002");
    expect(issue.identifier).toBe("ENG-123");
    expect(issue.url).toBe("https://linear.app/example/issue/ENG-123/fix-the-login-redirect-loop");
  });
});

describe("issues.update", () => {
  it("requires id", () => {
    expect(() => actions["issues.update"]!({ apiKey: "k", title: "x" })).toThrow("id is required");
  });

  it("is classified as a GraphQL mutation", () => {
    expect(manifest.operations["issues.update"]!.sideEffect).toBe("write");
  });

  it("accepts the human identifier as id and sends only the fields provided", async () => {
    const { calls, fetchFn } = mockJson(issueUpdateFixture);
    const result = await actions["issues.update"]!({
      apiKey: "k",
      id: "ENG-123",
      stateId: "state-uuid",
      fetch: fetchFn,
    }) as Record<string, unknown>;

    const sent = bodyOf(calls[0]!);
    const variables = sent.variables as Record<string, unknown>;
    expect(variables.id).toBe("ENG-123");
    const input = variables.input as Record<string, unknown>;
    expect(input.stateId).toBe("state-uuid");
    expect(input.title).toBeUndefined();

    const issue = result.issue as Record<string, unknown>;
    expect((issue.state as Record<string, unknown>).name).toBe("In Progress");
  });
});

describe("issues.get", () => {
  it("requires id", () => {
    expect(() => actions["issues.get"]!({ apiKey: "k" })).toThrow("id is required");
  });

  it("is classified as a GraphQL query, safe to run without confirmation", () => {
    expect(manifest.operations["issues.get"]!.sideEffect).toBe("read");
  });

  it("fetches an issue by human identifier and returns the full issue object", async () => {
    const { calls, fetchFn } = mockJson(issueFixture);
    const result = await actions["issues.get"]!({ apiKey: "k", id: "ENG-123", fetch: fetchFn }) as Record<string, unknown>;
    const sent = bodyOf(calls[0]!);
    expect((sent.variables as Record<string, unknown>).id).toBe("ENG-123");
    expect(result.issue).toEqual(issueFixture.data.issue);
  });
});

describe("issues.list", () => {
  it("does not require input and is a read", () => {
    expect(manifest.operations["issues.list"]!.sideEffect).toBe("read");
  });

  it("paginates with first/after and returns nodes plus the relay cursor", async () => {
    const { calls, fetchFn } = mockJson(issuesFixture);
    const result = await actions["issues.list"]!({ apiKey: "k", first: 25, after: "prev-cursor", fetch: fetchFn }) as Record<string, unknown>;
    const sent = bodyOf(calls[0]!);
    const variables = sent.variables as Record<string, unknown>;
    expect(variables.first).toBe(25);
    expect(variables.after).toBe("prev-cursor");
    expect(result.issues).toEqual(issuesFixture.data.issues.nodes);
    expect(result.nextCursor).toBe("cursor-page-2");
    expect(result.hasNextPage).toBe(true);
  });

  it("passes a raw filter object through to variables.filter", async () => {
    const { calls, fetchFn } = mockJson(issuesFixture);
    await actions["issues.list"]!({ apiKey: "k", filter: { team: { id: { eq: "team-uuid" } } }, fetch: fetchFn });
    const sent = bodyOf(calls[0]!);
    expect((sent.variables as Record<string, unknown>).filter).toEqual({ team: { id: { eq: "team-uuid" } } });
  });
});

describe("issues.search", () => {
  it("requires term", () => {
    expect(() => actions["issues.search"]!({ apiKey: "k" })).toThrow("term is required");
  });

  it("uses searchIssues, not the deprecated issueSearch", async () => {
    const { calls, fetchFn } = mockJson({ data: { searchIssues: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } });
    await actions["issues.search"]!({ apiKey: "k", term: "login redirect", fetch: fetchFn });
    const sent = bodyOf(calls[0]!);
    expect(String(sent.query)).toContain("searchIssues(term: $term, first: $first, after: $after)");
    expect(String(sent.query)).not.toContain("issueSearch");
    expect((sent.variables as Record<string, unknown>).term).toBe("login redirect");
  });

  it("accepts after and flattens the relay cursor to nextCursor/hasNextPage, matching the other list operations", async () => {
    const { calls, fetchFn } = mockJson({
      data: { searchIssues: { nodes: [{ id: "issue-1" }], pageInfo: { hasNextPage: true, endCursor: "cursor-search-1" } } },
    });
    const result = await actions["issues.search"]!({
      apiKey: "k", term: "login redirect", after: "cursor-search-0", fetch: fetchFn,
    }) as Record<string, unknown>;
    const sent = bodyOf(calls[0]!);
    expect((sent.variables as Record<string, unknown>).after).toBe("cursor-search-0");
    expect(result.nextCursor).toBe("cursor-search-1");
    expect(result.hasNextPage).toBe(true);
    expect(result.pageInfo).toBeUndefined();
  });
});

describe("comments.create", () => {
  it("requires issueId and body", () => {
    expect(() => actions["comments.create"]!({ apiKey: "k", body: "hi" })).toThrow("issueId is required");
    expect(() => actions["comments.create"]!({ apiKey: "k", issueId: "ENG-123" })).toThrow("body is required");
  });

  it("is classified as a GraphQL mutation", () => {
    expect(manifest.operations["comments.create"]!.sideEffect).toBe("write");
  });

  it("posts commentCreate and returns the created comment's id and url", async () => {
    const { calls, fetchFn } = mockJson(commentCreateFixture);
    const result = await actions["comments.create"]!({
      apiKey: "k", issueId: "ENG-123", body: "Confirmed on staging.", fetch: fetchFn,
    }) as Record<string, unknown>;
    const sent = bodyOf(calls[0]!);
    const input = (sent.variables as Record<string, unknown>).input as Record<string, unknown>;
    expect(input.issueId).toBe("ENG-123");
    expect(input.body).toBe("Confirmed on staging.");
    const comment = result.comment as Record<string, unknown>;
    expect(comment.id).toBe("a1b2c3d4-0008-4a11-8b11-000000000008");
    expect(comment.url).toContain("comment-a1b2c3d4");
  });
});

describe("teams.list", () => {
  it("lists teams with a relay cursor", async () => {
    const { fetchFn } = mockJson(teamsFixture);
    const result = await actions["teams.list"]!({ apiKey: "k", fetch: fetchFn }) as Record<string, unknown>;
    expect(result.teams).toEqual(teamsFixture.data.teams.nodes);
    expect(result.nextCursor).toBe("cursor-teams-end");
    expect(result.hasNextPage).toBe(false);
  });
});

describe("workflowStates.list", () => {
  it("resolves stateId candidates for a team, one page only", async () => {
    const { calls, fetchFn } = mockJson(workflowStatesFixture);
    const result = await actions["workflowStates.list"]!({
      apiKey: "k", filter: { team: { id: { eq: "team-uuid" } } }, fetch: fetchFn,
    }) as Record<string, unknown>;
    const sent = bodyOf(calls[0]!);
    expect((sent.variables as Record<string, unknown>).filter).toEqual({ team: { id: { eq: "team-uuid" } } });
    expect(sent.variables as Record<string, unknown>).not.toHaveProperty("after");
    expect(String(sent.query)).not.toContain("$after");
    expect(result.workflowStates).toEqual(workflowStatesFixture.data.workflowStates.nodes);
    // No after input exists to request the next page this pageInfo would
    // advertise, so the result must not expose it — surfacing pageInfo (or a
    // nextCursor) here would be a promise the operation cannot keep.
    expect(result.pageInfo).toBeUndefined();
    expect(result.nextCursor).toBeUndefined();
  });
});

describe("projects.list and projects.get", () => {
  it("lists projects with a relay cursor", async () => {
    const { fetchFn } = mockJson(projectsFixture);
    const result = await actions["projects.list"]!({ apiKey: "k", fetch: fetchFn }) as Record<string, unknown>;
    expect(result.projects).toEqual(projectsFixture.data.projects.nodes);
    expect(result.nextCursor).toBe("cursor-projects-end");
  });

  it("requires id and fetches a single project", async () => {
    expect(() => actions["projects.get"]!({ apiKey: "k" })).toThrow("id is required");
    const { fetchFn } = mockJson(projectFixture);
    const result = await actions["projects.get"]!({ apiKey: "k", id: "project-uuid", fetch: fetchFn }) as Record<string, unknown>;
    expect(result.project).toEqual(projectFixture.data.project);
  });
});

describe("users.list", () => {
  it("lists users with a relay cursor, to resolve assigneeId", async () => {
    const { fetchFn } = mockJson(usersFixture);
    const result = await actions["users.list"]!({ apiKey: "k", fetch: fetchFn }) as Record<string, unknown>;
    expect(result.users).toEqual(usersFixture.data.users.nodes);
    expect(result.hasNextPage).toBe(false);
  });
});

describe("organization.get", () => {
  it("fetches the organization with no input", async () => {
    const { fetchFn } = mockJson(organizationFixture);
    const result = await actions["organization.get"]!({ apiKey: "k", fetch: fetchFn }) as Record<string, unknown>;
    expect(result.organization).toEqual(organizationFixture.data.organization);
  });
});

// --- The two mandatory GraphQL-specific error cases from the task brief ---

describe("error mapping", () => {
  it("rejects a 200 carrying a populated errors array as CONNECTOR_UPSTREAM_ERROR, carrying Linear's own message", async () => {
    const { fetchFn } = mockJson(errorGraphqlFixture, 200);
    await expect(actions["issues.create"]!({ apiKey: "k", teamId: "team-uuid", title: "x", fetch: fetchFn }))
      .rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: "Argument Validation Error" });
  });

  it("rejects a 400 with errors[0].extensions.code RATELIMITED as CONNECTOR_RATE_LIMITED, not a generic upstream error", async () => {
    const { fetchFn } = mockJson(errorRateLimitedFixture, 400);
    await expect(actions.healthcheck!({ apiKey: "k", fetch: fetchFn }))
      .rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 60 });
  });

  it("does not classify an ordinary 400 without a RATELIMITED code as a rate limit", async () => {
    const { fetchFn } = mockJson({ errors: [{ message: "Bad request", extensions: { code: "BAD_USER_INPUT" } }] }, 400);
    await expect(actions.healthcheck!({ apiKey: "k", fetch: fetchFn }))
      .rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: "Bad request" });
  });

  it("refuses a host outside the manifest's allow list", async () => {
    const offHost = { ...manifest, network: { allowedHosts: ["example.invalid"] } };
    const compiled = compileDeclarativeConnector(offHost as never);
    await expect(compiled.actions.healthcheck!({ apiKey: "k", fetch: async () => new Response(JSON.stringify(viewerFixture)) }))
      .rejects.toMatchObject({ code: "OUTBOUND_HOST_NOT_ALLOWED" });
  });
});
